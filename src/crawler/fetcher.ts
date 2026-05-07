import axios from "axios";
import config from "../config/config.js";
import type { FetchResult } from "../types/crawl.js";

export async function fetchPage(url: string): Promise<FetchResult> {
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.retries; attempt += 1) {
    try {
      const response = await axios.get<string>(url, {
        timeout: config.timeout,
        headers: {
          "User-Agent": config.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        },
        maxRedirects: 5,
        validateStatus: () => true,
        responseType: "text"
      });

      if ((response.status === 429 || response.status === 503) && attempt < config.retries) {
        await delay(getBackoffDelayMs(response.headers["retry-after"], attempt));
        continue;
      }

      return {
        url,
        finalUrl: response.request?.res?.responseUrl || url,
        status: response.status,
        contentType: String(response.headers["content-type"] || ""),
        html: typeof response.data === "string" ? response.data : String(response.data),
        loadTimeMs: Date.now() - startedAt
      };
    } catch (error) {
      lastError = error;
      if (attempt < config.retries) {
        await delay(config.retryDelayMs);
      }
    }
  }

  throw lastError;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleepBetweenRequests(baseDelayMs: number): Promise<void> {
  const jitterMs = Math.floor(Math.random() * 2000);
  return delay(baseDelayMs + jitterMs);
}

function getBackoffDelayMs(retryAfter: unknown, attempt: number): number {
  const retryAfterSeconds = Number(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return config.retryDelayMs * (attempt + 2);
}
