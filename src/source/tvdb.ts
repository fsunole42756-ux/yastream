import { ContentType } from "@stremio-addon/sdk";
import axios, { AxiosRequestConfig } from "axios";
import { axiosGet } from "../utils/axios.js";
import { cache } from "../utils/cache.js";
import { ENV } from "../utils/env.js";
import { CountryCode, iso639FromCountryCode } from "../utils/language.js";
import { BaseMeta, ContentDetail } from "./meta.js";
import { Provider } from "./provider.js";
import { TvdbError } from "../utils/error.js";

interface TvdbMovieResult {
  data: {
    id: number;
    name: string; // original language
    aliases: [
      {
        language: string;
        name: string;
      },
    ];
    image: string;
    year: string;
  };
}

interface TvdbSeriesTranslationResult {
  data: {
    id: number;
    name: string; // altTitle
    year: string;
    lang: string;
    alias: string[];
    overview: string;
  };
}
interface TvdbSeriesResult {
  data: {
    id: number;
    name: string; // original language
    aliases: [
      {
        language: string;
        name: string;
      },
    ];
    firstAired: string;
    image: string;
    year: string;
    overview: string;
  };
}
class TVDBService extends BaseMeta {
  private apiKey: string = ENV.TVDB_API_KEY;
  private baseUrl: string = "https://api4.thetvdb.com/v4";

  async getDetailTvdb(
    tvdbId: string,
    type: ContentType,
  ): Promise<ContentDetail | null> {
    if (type === "series") {
      return await this.getSeriesDetail(tvdbId);
    } else {
      return await this.getMovieDetail(tvdbId);
    }
  }

  async getMovieDetail(tvdbId: string): Promise<ContentDetail | null> {
    try {
      const movie: TvdbMovieResult = await this._getMovie(tvdbId);

      if (movie) {
        const year = parseInt(movie.data.year);
        const isoLanguage = iso639FromCountryCode(CountryCode.en);
        const engTitle =
          movie.data.aliases.filter((alias) => {
            return alias.language === isoLanguage;
          })?.[0]?.name || movie.data.name;
        this.logger.log(`Get | ${engTitle} ${year}`);
        return {
          title: engTitle,
          year: year,
          type: "movie",
          tvdbId: movie.data.id,
          id: movie.data.id.toString(),
        };
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Get movie details error | ${error.message}`);
      return null;
    }
  }

  async getSeriesDetail(id: string): Promise<ContentDetail | null> {
    try {
      const seriesPromise = this._getSeries(id);
      const seriesEngPromise = this._getSeriesTranslation(id);
      const seriesAll = await Promise.all([seriesPromise, seriesEngPromise]);
      const series = seriesAll[0];
      if (series) {
        const year = series.data.year;
        const isoLanguage = iso639FromCountryCode(CountryCode.en);
        const engTitle =
          series.data.aliases.filter((alias) => {
            return alias.language === isoLanguage;
          })?.[0]?.name || series.data.name;
        const altTitle = seriesAll[1].data.name;
        this.logger.log(`Get | ${engTitle} ${year}`);
        this.logger.log(`Get alternative title | ${altTitle} ${year}`);
        return {
          title: engTitle,
          altTitle: altTitle,
          overview: series.data.overview,
          year: parseInt(year),
          type: "series",
          tvdbId: series.data.id,
          id: series.data.id.toString(),
        };
      }

      return null;
    } catch (error: any) {
      this.logger.error(`Get series details error | ${error.message}`);
      return null;
    }
  }

  private async _getMovie(id: string): Promise<TvdbMovieResult> {
    const data: TvdbMovieResult = await this._getRequest("/movies/" + id);
    return data;
  }
  private async _getSeries(id: string): Promise<TvdbSeriesResult> {
    const data: TvdbSeriesResult = await this._getRequest("/series/" + id);
    return data;
  }

  private async _getSeriesTranslation(
    id: string,
  ): Promise<TvdbSeriesTranslationResult> {
    const data: TvdbSeriesTranslationResult = await this._getRequest(
      `/series/${id}/translations/eng`,
    );
    return data;
  }

  private async _getRequest(
    endpoint: string,
    params: Record<string, any> = {},
  ): Promise<any> {
    const token = await this._authenticate();
    const config: AxiosRequestConfig = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      params: params,
    };
    const url = `${this.baseUrl}${endpoint}`;
    this.logger.log(`GET | ${url}`);
    const data = await axiosGet(url, config);
    return data;
  }

  /**
   * TVDB v4 requires a login to get a JWT token before making requests.
   */
  private async _authenticate(): Promise<string> {
    const tvdbTokenKey = `token:tvdb`;
    const cacheToken = cache.get(tvdbTokenKey);
    if (cacheToken) return cacheToken;

    try {
      const response = await axios.post(`${this.baseUrl}/login`, {
        apikey: this.apiKey,
      });
      const token = response.data.data.token;
      cache.set(tvdbTokenKey, token, 28 * 24 * 60 * 60 * 1000); // token 1 month
      return token;
    } catch (error: any) {
      this.logger.error(`Auth failed | ${error.message}`);
      throw new TvdbError("TVDB Authentication failed");
    }
  }
}

export const tvdb = new TVDBService(Provider.TVDB);
