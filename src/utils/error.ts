import { RATE_LIMIT_NAME } from "./constant.js";
import { Logger } from "./logger.js";

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.RATE_LIMIT;
  }
}

export class TmdbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.TMDB;
  }
}
export class TvdbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.TVDB;
  }
}
export class FuseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.FUSE;
  }
}

export class MatchingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.MATCHING;
  }
}
export class ProbeInfoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.PROBE_INFO;
  }
}


export class KisskhDetailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.KISSKH_DETAIL;
  }
}
export class KisskhEpisodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.KISSKH_EPISODE;
  }
}
export class KisskhTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = ErrorName.KISSKH_TOKEN;
  }
}
enum ErrorName {
  ERROR = "Error",
  RATE_LIMIT = RATE_LIMIT_NAME,
  FUSE = "Fuse Error",
  MATCHING = "Matching Error",
  UNKNOWN = "Unknown Error",
  // PROBE
  PROBE_INFO = "Probe Info Error",
  // DB
  DB_LOCK = "DB Lock Error",
  DB_FOREIGN_KEY = "DB Foreign Key Error",
  DB_UNIQUE = "DB Unique Error",
  // Meta
  TMDB = "TMDB Error",
  TVDB = "TVDB Error",
  // KISSKH
  KISSKH_DETAIL = "[Kisskh] Detail Error",
  KISSKH_EPISODE = "[Kisskh] Episode Error",
  KISSKH_TOKEN = "[Kisskh] Token Error",
  // ONETOUCHTV
  ONETOUCHTV_DETAIL = "[Onetouchtv] Detail Error",
  ONETOUCHTV_EPISODE = "[Onetouchtv] Episode Error",
}

export function handleError(
  error: Error | any,
  logger: Logger = new Logger("ERROR"),
  message: string = "",
): Error | null {
  if (error instanceof RateLimitError) {
    logger.warn(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof FuseError) {
    logger.warn(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof MatchingError) {
    logger.warn(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof ProbeInfoError) {
    logger.warn(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof KisskhDetailError) {
    logger.warn(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof KisskhEpisodeError) {
    logger.warn(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof TmdbError) {
    logger.warn(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof TvdbError) {
    logger.warn(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof KisskhTokenError) {
    logger.error(`${message} | ${error.message}`);
    return error;
  }
  if (error instanceof Error) {
    if (error.message.includes("lock")) {
      logger.error(`${message} | ${error.message}`);
      error.name = ErrorName.DB_LOCK;
      return error;
    }
    if (error.message.includes("FOREIGN KEY")) {
      logger.warn(`${message} | ${error.message}`);
      error.name = ErrorName.DB_FOREIGN_KEY;
      return error;
    }
    if (error.message.includes("UNIQUE")) {
      logger.warn(`${message} | ${error.message}`);
      error.name = ErrorName.DB_UNIQUE;
      return error;
    }
    error.name = ErrorName.ERROR;
    logger.error(`${message} | ${error.message}`);
    return error;
  }
  error.name = ErrorName.UNKNOWN;
  logger.error(error);
  return error;
}
