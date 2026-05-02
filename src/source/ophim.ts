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
import { formatStreamTitle } from "../utils/format.js";
import { matchTitle, Search } from "../utils/fuse.js";
import { probeStreamInfo } from "../utils/info.js";
import { ContentDetail } from "./meta.js";
import { BaseProvider } from "./provider.js";

interface OphimSearchResponse {
  data: {
    items: OphimMovie[];
  };
}
interface OphimMovie {
  name: string;
  origin_name: string;
  year: number;
  slug: string;
  poster_url: string;
  episodes: OphimServer[];
}
interface OphimDetailResponse {
  data: {
    item: OphimMovie;
  };
}
interface OphimServer {
  server_data: OphimEpisodeItem[];
}
interface OphimEpisodeItem {
  name: string;
  slug: string;
  link_m3u8: string;
}

export class OphimScraper extends BaseProvider {
  readonly baseUrl = "https://ophim1.com";
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
      const { title, type, year, season, episode, id, tmdbId, altTitle } =
        content;
      const streamKey = `streams:${type}:${this.name}:${id}:${title}:${season}:${episode}`;
      const cacheStreams = cache.get(streamKey);
      if (cacheStreams) return cacheStreams;
      const data = await this.searchTitle(title, year);
      if (!data) return [];
      const firstServer = data.data.item.episodes[0];
      let episodeDetail = null;
      if (type !== "movie") {
        episodeDetail = firstServer?.server_data.find((episodeItem) =>
          episodeItem.name.includes(episode?.toString() || "1"),
        );
      } else {
        episodeDetail = firstServer?.server_data[0];
      }
      const url = episodeDetail?.link_m3u8;
      if (!url) return [];
      this.logger.log(`Stream Url | ${url}`);
      const info = config.info ? await probeStreamInfo(url) : undefined;
      const formatTitle = formatStreamTitle(
        data.data.item.name,
        year,
        season,
        episode,
        info,
      );
      const streams: Stream[] = [
        {
          name: this.displayName,
          title: formatTitle,
          url: url,
          behaviorHints: {
            notWebReady: true,
            bingeGroup: this.displayName,
            filename: `${formatTitle}-${this.name}`,
          },
        },
      ];
      cache.set(streamKey, streams, 8 * 60 * 60 * 1000);
      return streams;
    } catch (error) {
      this.logger.error(`Fail to get ${content.title} | ${error}`);
      return [];
    }
  }

  getSubtitles(content: ContentDetail): Promise<Subtitle[]> {
    throw new Error("Method not implemented.");
  }

  async searchTitle(
    title: string,
    year?: number,
  ): Promise<OphimDetailResponse | null> {
    const searchUrl = `${this.baseUrl}/v1/api/tim-kiem?keyword=${title}&year=${year}`;
    this.logger.log(`GET search | ${searchUrl}`);
    const data = await axiosGet<OphimSearchResponse>(searchUrl);
    if (!data) return null;
    if (data.data.items.length === 0) return null;
    const items = data.data.items.filter((item) => {
      return item.year == year;
    });
    const searchItems = items.map((item) => {
      const search: OphimMovie & Search = {
        ...item,
        title: item.origin_name,
      };
      return search;
    });
    const detail = matchTitle(searchItems, title, year)[0];
    if (!detail) return null;
    const slug = detail.slug;
    const detailUrl = `${this.baseUrl}/v1/api/phim/${slug}`;
    this.logger.log(`GET detail | ${detailUrl}`);
    const movie = await axiosGet<OphimDetailResponse>(detailUrl);
    if (!movie) return null;
    return movie;
  }
}
