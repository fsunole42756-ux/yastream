import axios, { AxiosError, AxiosRequestConfig, HttpStatusCode } from "axios";
import EventEmitter from "events";
import https from "https";
import { decryptString } from "../source/onetouchtv-crypto.js";
import { cache } from "./cache.js";
import { USER_AGENT } from "./constant.js";
import { ENV } from "./env.js";
import { RateLimitError } from "./error.js";
import { Logger } from "./logger.js";

// process.setMaxListeners(20);
EventEmitter.defaultMaxListeners = 23;

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 20,
  maxFreeSockets: 10,
  timeout: 60000,
});

function createClient(
  // maxRequests: number,
  // duration: string = "1s",
  headers: Record<string, string> = {},
) {
  const instance = axios.create({ httpsAgent, headers });
  return instance;
  // when need to queue requests to avoid rate limit, use this:
  // return rateLimit(instance, {
  //   limits: [{ maxRequests, duration }],
  // });
}

const defaultClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "aplication/json",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
});
const kisskhClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "application/json",
});
const onetouchtvHost = Buffer.from("YXBpMy5kZXZjb3JwLm1l=", "base64").toString(
  "utf-8",
);
const onetouchtvClient = createClient({
  "User-Agent": USER_AGENT,
  Accept: "*/*",
  Origin: "https://onetouchtv.xyz",
  Referer: "https://onetouchtv.xyz",
});
onetouchtvClient.interceptors.response.use((response) => {
  response.data = decryptString(response.data);
  return response;
});

function getClient(url: string) {
  if (ENV.KISSKH_URLS.some((kisskhUrl) => url.includes(kisskhUrl))) {
    return kisskhClient;
  }
  if (url.includes(onetouchtvHost)) {
    return onetouchtvClient;
  }
  return defaultClient;
}

const logger = new Logger("AXIOS");
export async function axiosGet<T>(
  url: string,
  config?: AxiosRequestConfig,
  cacheMs: number = 2 * 60 * 60 * 1000,
): Promise<T | null> {
  const urlKey = `url:${url}`;
  const cacheData = cache.get(urlKey);
  if (cacheData) return cacheData;
  let lastError: AxiosError | unknown;
  const http = getClient(url);
  let attempt = 0;
  let timeout = 0;
  let isRateLimit = false;

  // Global timeout wrapper to prevent hanging forever
  const globalTimeout = ENV.RETRY_TIMEOUT_MS + 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), globalTimeout);

  try {
    while (true) {
      attempt++;
      try {
        const response = await http.get(url, {
          timeout: 10000,
          ...config,
          signal: controller.signal as any,
        });
        clearTimeout(timeoutId);
        const data = response.data;
        cache.set(urlKey, data, cacheMs);
        return data as T;
      } catch (error: AxiosError | unknown) {
        lastError = error;
        const errorStatus =
          error instanceof AxiosError && error.response?.status;
        isRateLimit = errorStatus === HttpStatusCode.TooManyRequests;
        if (http === onetouchtvClient) {
          logger.log(
            `Error ${error instanceof AxiosError && error.response?.data}`,
          );
          isRateLimit = isRateLimit || errorStatus === HttpStatusCode.NotFound;
        }
        if (!isRateLimit) break;
        const delay = ENV.RETRY_DELAY_MS * attempt;
        logger.log(`Retry ${attempt} | ${url}`);
        const retryAfter = delay + Math.random() * ENV.RETRY_JITTER_MS;
        timeout += retryAfter;
        if (timeout >= ENV.RETRY_TIMEOUT_MS) {
          logger.log(`Max timeout ${ENV.RETRY_TIMEOUT_MS}ms reached | ${url}`);
          break;
        }
        await new Promise((r) => setTimeout(r, retryAfter));
      }
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (isRateLimit) {
    throw new RateLimitError(url);
  }
  logger.error(`Fail GET | ${url} ${lastError}`);
  return null;
}

export async function axiosHead<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<boolean> {
  const urlKey = `head:url:${url}`;
  const cacheData = cache.get(urlKey);
  if (cacheData) return cacheData;
  let lastError: AxiosError | unknown;
  let attempt = 0;
  let timeout = 0;
  while (true) {
    attempt++;
    try {
      await defaultClient.head(url, { timeout: 10000, ...config });
      cache.set(urlKey, true, 24 * 60 * 60 * 1000);
      return true;
    } catch (error) {
      lastError = error;
      const isRateLimit =
        error instanceof AxiosError &&
        error.response?.status === HttpStatusCode.TooManyRequests;
      if (!isRateLimit) break;
      const delay = ENV.RETRY_DELAY_MS * attempt;
      logger.log(`Retry ${attempt} HEAD | ${url}`);
      const retryAfter = delay + Math.random() * ENV.RETRY_JITTER_MS;
      timeout += retryAfter;
      if (timeout >= ENV.RETRY_TIMEOUT_MS) {
        logger.log(`Max timeout ${ENV.RETRY_TIMEOUT_MS}ms reached | ${url}`);
        break;
      }
      await new Promise((r) => setTimeout(r, retryAfter));
    }
  }
  logger.error(`Fail HEAD | ${url}, ${lastError}`);
  cache.set(urlKey, false, 4 * 60 * 60 * 1000);
  return false;
}
