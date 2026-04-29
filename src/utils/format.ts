import { getDisplayResolution, StreamInfo } from "./info.js";

export function formatStreamTitle(
  title: string,
  year?: number,
  season?: number,
  episode?: number,
  info?: StreamInfo,
) {
  let titleWithYear = `${title} ${year}`;
  if (year) {
    titleWithYear = title.includes(year.toString()) ? title : titleWithYear;
  }

  const displayHours = info?.hours ? `${info.hours} hours` : "";
  const displayMinutes = info?.minutes ? `${info.minutes} minutes` : "";
  const displayTime = `${displayHours} ${displayMinutes}`.trim();
  const displaySize = info?.size ? `${info.size.toFixed(2)} GB | ` : "";
  const displayResolution = info?.resolution
    ? getDisplayResolution(info?.resolution)
    : "";
  const displaySizeResolution = `${displaySize}${displayResolution}`.trim();

  const formatTitle = season
    ? `${title} S${season.toString().padStart(2, "0")}E${episode?.toString().padStart(2, "0")}`
    : titleWithYear;
  const fullTitle = [formatTitle, displayTime, displaySizeResolution]
    .filter((item) => item.trim().length > 0)
    .join("\n");
  const titleInfo = info ? fullTitle : formatTitle;
  return titleInfo;
}

const YEAR_SYNTAX_REGEX = /\s*\((\d{4})\)\s*/g;
export function extractTitle(rawTitle: string) {
  let year: number | undefined;
  const cleanTitle = rawTitle
    .replace(YEAR_SYNTAX_REGEX, (match, yearGroup) => {
      year = parseInt(yearGroup);
      return ""; // Remove the syntax from the title
    })
    .trim();
  const { title, season } = extractSeason(cleanTitle);
  return { title: title, year: year, season: season };
}

export function extractSeason(rawTitle: string) {
  // title: Heart Signal Season 5
  let season: number | undefined;
  const cleanTitle = rawTitle
    .replace(/Season\s+(\d+)/, (match, seasonGroup) => {
      season = parseInt(seasonGroup);
      return "";
    })
    .trim();
  return { title: cleanTitle, season: season };
}

export const normalize = (str: string) => {
  return str
    .toLowerCase()
    .replace(/(\d+)(st|nd|rd|th)/g, "$1") // fix 2nd season -> 2 season
    .replace(/[\u2018\u2019\u00b4\u201a]/g, "'") // fix quotes
    .replace(/[^a-z0-9\s']/g, " ") // only character, space and quote
    .replace(/\s+/g, " ") // no extra spaces
    .trim();
};

const REQUIRED_QUERY_URLS = ["mixdrop", "dramacool", "dood", "masuketin"];
export function cleanUrl(url: string) {
  // remove query string
  if (REQUIRED_QUERY_URLS.some((queryUrl) => url.includes(queryUrl))) {
    return url;
  }
  return url.replace(/\?.*$/, "");
}

export function parseOrigin(url: string) {
  const hostname = new URL(url).origin;
  return hostname;
}