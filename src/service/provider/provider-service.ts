import { ContentType } from "@stremio-addon/sdk";
import {
  getContentJoinProviderById,
  getCountProviderContent,
  getProviderContent,
  getProviderContentsById as getMatchContentProvider,
} from "../../db/queries.js";
import { ContentDetail, ContentId } from "../../source/meta.js";
import { Provider } from "../../source/provider.js";
import { Prefix } from "../../lib/manifest.js";

class ProviderService {
  static async getProviderContent(id: string) {
    return getProviderContent(id);
  }

  static async getTotalProviderContent() {
    const count = await getCountProviderContent();
    if (!count) return 0;
    const total = count[0]?.count ?? 0;
    return total;
  }

  static async getSameProviderContent(id: string) {
    const dbContentAndProvider = await getMatchContentProvider(id);
    const providerContents = dbContentAndProvider?.providerContent;
    if (
      dbContentAndProvider &&
      providerContents &&
      providerContents.length > 0
    ) {
      return dbContentAndProvider;
    }
    return null;
  }

  static async getContentAndProvider(type: ContentType, contentId: ContentId) {
    const { imdbId, tmdbId, tvdbId, kisskhId, onetouchtvId } = contentId;
    const hasMetaId = imdbId || tmdbId || tvdbId;
    if (hasMetaId) {
      const dbContentAndProvider = await getContentJoinProviderById(
        type,
        imdbId,
        tmdbId,
        tvdbId,
      );
      const providerContents = dbContentAndProvider?.providerContent;
      if (
        dbContentAndProvider &&
        providerContents &&
        providerContents.length > 0
      ) {
        return dbContentAndProvider;
      }
    }
    const hasProviderId = kisskhId || onetouchtvId;
    if (hasProviderId) {
      let id: string | null = null;
      if (kisskhId) {
        id = `${Prefix.KISSKH}:${kisskhId}`;
      }
      if (onetouchtvId) {
        id = `${Prefix.ONETOUCHTV}:${onetouchtvId}`;
      }
      if (!id) return null;
      const dbContentAndProvider =
        await ProviderService.getSameProviderContent(id);
      const providerContents = dbContentAndProvider?.providerContent;
      if (
        dbContentAndProvider &&
        providerContents &&
        providerContents.length > 0
      ) {
        return dbContentAndProvider;
      }
    }
    return null;
  }

  static async getDbContent(contentType: ContentType, contentId: ContentId) {
    let dbContent: ContentDetail | null = null;
    const { imdbId, tmdbId, tvdbId, kisskhId, onetouchtvId } = contentId;
    const id: string | undefined =
      imdbId ??
      tmdbId?.toString() ??
      tvdbId?.toString() ??
      kisskhId ??
      onetouchtvId;
    if (!id) return null;
    const dbContentAndProvider = await ProviderService.getContentAndProvider(
      contentType,
      contentId,
    );
    if (!dbContentAndProvider) return null;
    const dbProviderContent = dbContentAndProvider.providerContent;
    dbContent = {
      id: id,
      title: dbContentAndProvider.title,
      year: dbContentAndProvider.year,
      type: contentType,
    };
    if (contentId.imdbId) dbContent.imdbId = contentId.imdbId;
    if (contentId.tmdbId) dbContent.tmdbId = contentId.tmdbId;
    if (contentId.tvdbId) dbContent.tvdbId = contentId.tvdbId;
    if (contentId.kisskhId) dbContent.kisskhId = contentId.kisskhId;
    if (contentId.onetouchtvId) dbContent.onetouchtvId = contentId.onetouchtvId;
    dbProviderContent.forEach((providerContent) => {
      switch (providerContent.provider) {
        case Provider.KISSKH:
          dbContent.kisskhId = providerContent.externalId;
          break;
        case Provider.ONETOUCHTV:
          dbContent.onetouchtvId = providerContent.externalId;
          break;
        default:
          break;
      }
    });
    return dbContent;
  }
}

export default ProviderService;
