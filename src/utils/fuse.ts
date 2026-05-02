import Fuse, { FuseResult, IFuseOptions } from "fuse.js";
import { token_sort_ratio } from "fuzzball";
import { Logger } from "./logger.js";
import { ENV } from "./env.js";
import { normalize } from "./format.js";
import { FuseError, MatchingError } from "./error.js";

interface SearchItem<T> {
  original: T;
  normalizedTitle: string;
}
interface BestMatch<T> {
  queryUsed: string;
  fuseResult: FuseResult<SearchItem<T>>;
}

const logger = new Logger("FUSE");

export interface Search {
  title: string;
}
/**
 * Loop through all search terms and find the best fit
 */
export function matchTitle<T extends Search>(
  results: T[],
  title: string,
  year?: number,
  season?: number,
  altTitle?: string,
): T[] {
  const options: IFuseOptions<SearchItem<T>> = {
    keys: ["normalizedTitle"],
    includeScore: true,
    threshold: 0.2, // 0 is perfect match, 1 is all
    isCaseSensitive: false,
    location: 0,
    ignoreLocation: false,
    ignoreFieldNorm: true,
    includeMatches: false,
    distance: 100,
    shouldSort: true,
    findAllMatches: false,
  };

  const searchList: SearchItem<T>[] = results.map((originalItem) => ({
    original: originalItem,
    normalizedTitle: normalize(originalItem.title),
  }));
  const fuse = new Fuse(searchList, options);

  const searchTitles = createSearchList(title, season, year);
  if (altTitle) searchTitles.push(...createSearchList(altTitle, season, year));

  let best: BestMatch<T> | null = null;

  for (const query of searchTitles) {
    const normalizedQuery = normalize(query);
    const searchResults = fuse.search(normalizedQuery);
    if (searchResults.length === 0) continue;
    const candidate = searchResults[0]!;
    if (
      !best ||
      (candidate.score?.toFixed(3) ?? 1) <=
        (best.fuseResult.score?.toFixed(3) ?? 1)
    ) {
      best = { fuseResult: candidate, queryUsed: normalizedQuery };
    }
  }

  if (!best) {
    throw new FuseError(
      `FUSE filtered all results | ${title} ${year} Season ${season}`,
    );
  }
  const candidateTitle = best.fuseResult.item.normalizedTitle;
  const tokenScore = token_sort_ratio(best.queryUsed, candidateTitle);
  if (tokenScore <= ENV.MIN_MATCHING_SCORE) {
    throw new MatchingError(
      `Token-set score too low (${tokenScore}) | "${best.queryUsed}" -> "${candidateTitle}"`,
    );
  }
  logger.log(
    `Match | ${best.fuseResult.item.original.title}, Fuse ${best.fuseResult.score?.toFixed(3)}, Fuzz ${tokenScore}`,
  );

  return [best.fuseResult.item.original];
}

function createSearchList(title: string, season?: number, year?: number) {
  const searchTitles = [title];
  if (season) {
    searchTitles.push(
      ...[
        `${title} ${season}`,
        `${title} Season ${season}`,
        `${title} ${season} Season`,
      ],
    );
  }
  if (year) {
    searchTitles.push(`${title} ${year}`);
  }
  if (season && year) {
    searchTitles.push(
      ...[`${title} ${season} ${year}`, `${title} Season ${season} ${year}`],
    );
  }
  return searchTitles;
}
