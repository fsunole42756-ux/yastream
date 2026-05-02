import { ContentType } from "@stremio-addon/sdk";
import { AxiosRequestConfig } from "axios";
import { URLSearchParams } from "url";
import { axiosGet } from "../utils/axios.js";
import { ENV } from "../utils/env.js";
import { extractTitle } from "../utils/format.js";
import { matchTitle, Search } from "../utils/fuse.js";
import { BaseMeta, ContentDetail } from "./meta.js";
import { Provider } from "./provider.js";
import { handleError, TmdbError } from "../utils/error.js";

export interface TmdbFindResponse {
  movie_results: TmdbMovieResult[];
  person_results: any[];
  tv_results: TmdbTvResult[];
  tv_episode_results: any[];
  tv_season_results: any[];
}

export interface TmdbTvResult {
  id: number;
  imdb_id?: string;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  poster_path: string;
  backdrop_path?: string;
}
export interface TmdbTvImages {
  backdrops: TmdbTvImage[];
  logos: TmdbTvImage[];
  posters: TmdbTvImage[];
}
interface TmdbTvImage {
  aspect_ratio: number;
  height: number;
  iso_3166_1: string;
  iso_639_1: string;
  file_path: string;
  vote_average: number;
  vote_count: number;
  width: number;
}

interface TmdbExternalID {
  id: number;
  imdb_id: string | null;
  freebase_mid: string | null;
  freebase_id: string | null;
  tvdb_id: number | null;
  tvrage_id: number | null;
  wikidata_id: string | null;
  facebook_id: string | null;
  instagram_id: string | null;
  twitter_id: string | null;
}

export interface TmdbMovieResult {
  id: number;
  imdb_id?: string;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string;
  backdrop_path?: string;
}

interface TmdbSeach extends Search {}

interface TmdbMovieSearch {
  results: TmdbMovieResult[];
}
interface TmdbTvSearch {
  results: TmdbTvResult[];
}

class TMDBService extends BaseMeta {
  private apiKey: string = ENV.TMDB_API_KEY;
  private baseUrl: string = "https://api.themoviedb.org/3";
  private imageUrl: string = "https://image.tmdb.org";

  async searchDetail(
    search: string,
    type: ContentType,
    year?: number,
  ): Promise<ContentDetail | null> {
    const extracted = extractTitle(search);
    search = extracted.title;
    year = extracted.year || year;
    if (type === "series") {
      return await this.searchSeriesDetail(search, year);
    } else {
      return await this.searchMovieDetail(search, year);
    }
  }

  async findDetailImdb(
    imdbId: string,
    type: ContentType,
  ): Promise<ContentDetail | null> {
    if (type === "series") {
      return await this.findSeriesDetail(imdbId);
    } else {
      return await this.findMovieDetail(imdbId);
    }
  }

  async getDetailTmdb(
    tmdbId: string,
    type: ContentType,
  ): Promise<ContentDetail | null> {
    if (type === "series") {
      return await this.getSeriesDetail(tmdbId);
    } else {
      return await this.getMovieDetail(tmdbId);
    }
  }

  async getSearchSeries(title: string, year?: number): Promise<TmdbTvSearch> {
    if (year) {
      const param = { query: title, year: year };
      return await this._getRequest(`/search/tv`, param);
    }
    return await this._getRequest(`/search/tv`, { query: title });
  }

  async searchSeriesDetail(
    title: string,
    year?: number,
  ): Promise<ContentDetail | null> {
    try {
      const response = await this.getSearchSeries(title, year);
      const titles = response.results.map((result) => {
        const year = new Date(result.first_air_date).getFullYear();
        const thumbnail = result.poster_path
          ? `${this.imageUrl}/t/p/w500${result.poster_path}`
          : "";
        const search: ContentDetail = {
          id: result.id.toString(),
          title: result.name,
          overview: result.overview,
          thumbnail: thumbnail,
          year: year,
          type: "series",
          tmdbId: result.id,
        };
        return search;
      });
      const detail = matchTitle<ContentDetail>(titles, title, year);
      const tv = detail[0];
      if (tv) {
        const images: TmdbTvImages = await this._getRequest(
          `/tv/${tv.tmdbId}/images`,
        );
        const detail = await this.getSeriesDetail(tv.id);
        if (detail?.imdbId) {
          tv.imdbId = detail?.imdbId;
        }
        this.logger.log(`Found | ${tv.title} ${tv.year} ${tv.imdbId || ""}`);
        if (images) {
          if (images.logos.length > 0) {
            const filePath =
              images.logos.find((logo: any) => logo.iso_639_1 === "en")
                ?.file_path ||
              images.logos[0]?.file_path ||
              "";
            tv.logo = `${this.imageUrl}/t/p/w500${filePath}`;
          }
        }
        return tv;
      }
      return null;
    } catch (error: any) {
      handleError(error, this.logger, `Search series`);
      return null;
    }
  }

  async getSearchMovie(title: string, year?: number): Promise<TmdbMovieSearch> {
    if (year) {
      const param = { query: title, year: year };
      return await this._getRequest(`/search/movie`, param);
    }
    return await this._getRequest(`/search/movie`, { query: title });
  }

  async searchMovieDetail(
    title: string,
    year?: number,
  ): Promise<ContentDetail | null> {
    try {
      const movieResponse = await this.getSearchMovie(title, year);
      const results = this.getMovies(movieResponse.results);
      const movie = matchTitle(results, title, year)[0];
      if (movie) {
        const detail = await this.getMovieDetail(movie.id);
        if (detail?.imdbId) {
          movie.imdbId = detail?.imdbId;
        }
        return movie;
      }
      return null;
    } catch (error: any) {
      this.logger.error(`Search movie | ${error.message}`);
      return null;
    }
  }
  async findMovieDetail(imdbId: string): Promise<ContentDetail | null> {
    try {
      const movieResponse: TmdbFindResponse = await this._getRequest(
        "/find/" + imdbId,
        {
          external_source: "imdb_id",
        },
      );
      const movie = movieResponse.movie_results?.[0];

      if (movie) {
        return this.getDetailFromMovie(movie);
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Find movie | ${error.message}`);
      return null;
    }
  }
  getMovies(movies: TmdbMovieResult[]) {
    return movies.map((movie) => {
      return this.getDetailFromMovie(movie);
    });
  }
  getDetailFromMovie(movie: TmdbMovieResult): ContentDetail {
    const year = new Date(movie.release_date).getFullYear();
    const thumbnail = `${this.imageUrl}/t/p/w500${movie.poster_path}`;
    const background = movie.backdrop_path
      ? `${this.imageUrl}/t/p/w500${movie.backdrop_path}`
      : undefined;
    const content: ContentDetail = {
      id: movie.id.toString(),
      title: movie.title,
      overview: movie.overview,
      thumbnail: thumbnail,
      year: year,
      type: "movie",
      tmdbId: movie.id,
    };
    if (background) content.background = background;
    if (movie.imdb_id) content.imdbId = movie.imdb_id;
    return content;
  }

  async findSeriesDetail(imdbId: string): Promise<ContentDetail | null> {
    try {
      const seriesResponse: TmdbFindResponse = await this._getRequest(
        "/find/" + imdbId,
        {
          external_source: "imdb_id",
        },
      );
      this.logger.debug(JSON.stringify(seriesResponse));
      const series = seriesResponse.tv_results[0];
      if (series) {
        const year = new Date(series.first_air_date).getFullYear();
        return {
          id: imdbId,
          title: series.name,
          overview: series.overview,
          year: year,
          type: "series",
          tmdbId: series.id,
          imdbId: imdbId,
        };
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Find series | ${error.message}`);
      return null;
    }
  }

  async getMovieDetail(tmdbId: string): Promise<ContentDetail | null> {
    try {
      const movie: TmdbMovieResult = await this._getRequest("/movie/" + tmdbId);

      if (movie) {
        const year = new Date(movie.release_date).getFullYear();
        const thumbnail = `${this.imageUrl}/t/p/w500${movie.poster_path}`;
        const content: ContentDetail = {
          id: movie.id.toString(),
          title: movie.title,
          overview: movie.overview,
          thumbnail: thumbnail,
          year: year,
          type: "movie",
          tmdbId: movie.id,
        };
        if (movie.imdb_id) content.imdbId = movie.imdb_id;
        return content;
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Get movie details error | ${error.message}`);
      return null;
    }
  }

  async getSeriesDetail(id: string): Promise<ContentDetail | null> {
    this.logger.debug(`ID ${id}`);
    try {
      const [series, externalId] = await Promise.all([
        this._getRequest<TmdbTvResult>("/tv/" + id),
        this._getExternalId(id, "series"),
      ]);
      if (series) {
        const year = new Date(series.first_air_date).getFullYear();
        const thumbnail = `${this.imageUrl}/t/p/w500${series.poster_path}`;
        const content: ContentDetail = {
          id: series.id.toString(),
          title: series.name,
          overview: series.overview,
          year: year,
          type: "series",
          tmdbId: series.id,
          thumbnail: thumbnail,
        };
        if (externalId?.imdb_id) content.imdbId = externalId.imdb_id;
        if (externalId?.tvdb_id) content.tvdbId = externalId.tvdb_id;
        return content;
      }

      return null;
    } catch (error: any) {
      handleError(error, this.logger, `Get series details error`);
      return null;
    }
  }

  private async _getExternalId(
    tmdbId: string,
    type: ContentType,
  ): Promise<TmdbExternalID | null> {
    try {
      const endpoint =
        type === "movie"
          ? `/movie/${tmdbId}/external_ids`
          : `/tv/${tmdbId}/external_ids`;
      const response = await this._getRequest<TmdbExternalID>(endpoint);
      return response;
    } catch (error) {
      this.logger.error(`Get external ID error | ${error}`);
      return null;
    }
  }

  private async _getRequest<T>(
    endpoint: string,
    params: Record<string, any> = {},
  ): Promise<T> {
    const queryParams = new URLSearchParams({
      ...params,
    });
    let url = `${this.baseUrl}${endpoint}`;
    if (queryParams.size > 0) {
      url += `?${queryParams}`;
    }
    const config: AxiosRequestConfig = {
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
      },
    };
    this.logger.log(`GET | ${url}`);
    const data = await axiosGet<T>(`${url}`, config);
    if (!data) {
      throw new TmdbError(`[TMDB  ] Not found data ${url}`);
    }
    return data;
  }
}

export const tmdb = new TMDBService(Provider.TMDB);
