import {
  CatalogHandlerArgs,
  ContentType,
  MetaDetail,
  MetaPreview,
  Stream,
  Subtitle,
} from "@stremio-addon/sdk";
import { Prefix, UserConfig } from "../lib/manifest.js";
import { axiosGet } from "../utils/axios.js";
import { cache } from "../utils/cache.js";
import { probeStreamInfo } from "../utils/info.js";
import { CountryCode, iso639FromCountryCode } from "../utils/language.js";
import { getProxyLink } from "../utils/mediaflowproxy.js";
import { ContentDetail } from "./meta.js";
import { BaseProvider } from "./provider.js";
import { matchTitle, Search } from "../utils/fuse.js";
import { formatStreamTitle } from "../utils/format.js";

interface KkphimSearchResponse {
  data: {
    items: KkphimMovie[];
  };
}
interface KkphimMovie {
  name: string;
  origin_name: string;
  slug: string;
  poster_url: string;
  year: number;
}
interface KkphimShowResponse {
  status: boolean;
  movie: KkphimMovie;
  episodes: KkphimEpisode[];
}
interface KkphimEpisode {
  server_data: KkphimEpisodeItem[];
}
interface KkphimEpisodeItem {
  name: string;
  slug: string;
  link_m3u8: string;
}

export class KkphimScraper extends BaseProvider {
  readonly baseUrl = "https://phimapi.com";
  readonly supportedPrefix: Prefix[] = [
    Prefix.IMDB,
    Prefix.TMDB,
    Prefix.TVDB,
    Prefix.KISSKH,
  ];

  async searchCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    const { id, type, extra } = args;
    const search = extra.search;
    throw new Error("Method not implemented.");
  }

  async getCatalog(
    args: CatalogHandlerArgs,
    config: UserConfig,
  ): Promise<MetaPreview[]> {
    throw new Error("Method not implemented.");
  }

  async getMeta(
    content: ContentDetail,
    type: ContentType,
  ): Promise<MetaDetail | null> {
    throw new Error("Method not implemented.");
  }

  async getStreams(
    content: ContentDetail,
    config: UserConfig,
  ): Promise<Stream[]> {
    try {
      const { title, type, year, season, episode, tmdbId } = content;
      const streamKey = `streams:${type}:${this.name}:${title}:${season}:${episode}`;
      const cacheStreams = cache.get(streamKey);
      if (cacheStreams) return cacheStreams;
      let data = null;
      if (tmdbId) {
        const url = `${this.baseUrl}/tmdb/${type === "series" ? "tv" : "movie"}/${tmdbId}`;
        this.logger.log(`GET tmdbId | ${url}`);
        data = await axiosGet<KkphimShowResponse>(url);
      }
      if (!data?.status) {
        data = await this.searchTitle(title, year, season);
      }
      if (!data) return [];
      const subtitleServer = data.episodes[0];
      if (!subtitleServer) return [];
      const voiceOverServer = data.episodes[1];
      let episodeDetails: KkphimEpisodeItem[] = [];
      if (type === "series") {
        episodeDetails = [
          subtitleServer.server_data.find((episodeItem) =>
            episodeItem.name.includes(episode?.toString() || "1"),
          )!,
        ];
        if (voiceOverServer) {
          episodeDetails.push(
            voiceOverServer.server_data.find((episodeItem) =>
              episodeItem.name.includes(episode?.toString() || "1"),
            )!,
          );
        }
      } else {
        episodeDetails = [subtitleServer.server_data[0]!];
        if (voiceOverServer) {
          episodeDetails.push(voiceOverServer.server_data[0]!);
        }
      }
      const name = data.movie.name;
      const streamPromises = episodeDetails.map(async (item, index) => {
        const link = item.link_m3u8;
        this.logger.log(`Stream Url | ${link}`);
        const proxyLink = getProxyLink(link);
        const info = config.info ? await probeStreamInfo(proxyLink) : undefined;
        const formatTitle = formatStreamTitle(
          `${name} | ${index === 0 ? "Phụ đề" : "Thuyết Minh"}`,
          year,
          season,
          episode,
          info,
        );
        const stream: Stream = {
          name: this.displayName,
          title: formatTitle,
          url: proxyLink,
          behaviorHints: {
            countryWhitelist: [iso639FromCountryCode(CountryCode.vi)],
            notWebReady: true,
            bingeGroup: `${this.displayName}-${index === 0 ? "subtitle" : "voiceover"}`,
            filename: `${formatTitle}-${this.name}`,
          },
        };
        return stream;
      });
      const streams: Stream[] = await Promise.all(streamPromises);
      cache.set(streamKey, streams, 8 * 60 * 60 * 1000);
      return streams as Stream[];
    } catch (error) {
      this.logger.error(`Fail to get ${content.title}, ${error}`);
      return [];
    }
  }

  getSubtitles(content: ContentDetail): Promise<Subtitle[]> {
    throw new Error("Method not implemented.");
  }

  async searchTitle(
    title: string,
    year?: number,
    season?: number,
  ): Promise<KkphimShowResponse | null> {
    const searchUrl = `${this.baseUrl}/v1/api/tim-kiem?keyword=${title}&year=${year}`;
    this.logger.log(`GET search | ${searchUrl}`);
    const data = await axiosGet<KkphimSearchResponse>(searchUrl);
    if (!data) return null;
    if (!data.data.items) return null;
    const items = data.data.items.filter((item) => {
      return item.year == year;
    });
    const searchItems = items.map((item) => {
      const search: KkphimMovie & Search = {
        ...item,
        title: item.origin_name,
      };
      return search;
    });
    const detail = matchTitle(searchItems, title, year, season)[0];
    if (!detail) return null;
    const slug = detail.slug;
    const detailUrl = `${this.baseUrl}/phim/${slug}`;
    this.logger.log(`GET detail | ${detailUrl}`);
    const movie = await axiosGet<KkphimShowResponse>(detailUrl);
    if (!movie) return null;
    return movie;
  }
}
