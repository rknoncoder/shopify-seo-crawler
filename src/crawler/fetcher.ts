import axios from "axios";
import config from "../config/config.js";
import type { CrawlRetryTelemetry, FetchResult } from "../types/crawl.js";

const retryTelemetry: CrawlRetryTelemetry = {
  totalRetries: 0,
  statusRetries: 0,
  errorRetries: 0,
  retryStatusCounts: {}
};

export function resetFetchTelemetry(): void {
  retryTelemetry.totalRetries = 0;
  retryTelemetry.statusRetries = 0;
  retryTelemetry.errorRetries = 0;
  retryTelemetry.retryStatusCounts = {};
}

export function getFetchTelemetry(): CrawlRetryTelemetry {
  return {
    totalRetries: retryTelemetry.totalRetries,
    statusRetries: retryTelemetry.statusRetries,
    errorRetries: retryTelemetry.errorRetries,
    retryStatusCounts: { ...retryTelemetry.retryStatusCounts }
  };
}

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
        recordStatusRetry(response.status);
        await delay(getBackoffDelayMs(response.headers["retry-after"], attempt));
        continue;
      }

      return {
        url,
        finalUrl: response.request?.res?.responseUrl || url,
        redirected: normalizeForRedirectCompare(url) !== normalizeForRedirectCompare(response.request?.res?.responseUrl || url),
        redirectCount: Number(response.request?._redirectable?._redirectCount || 0),
        status: response.status,
        contentType: String(response.headers["content-type"] || ""),
        html: typeof response.data === "string" ? response.data : String(response.data),
        loadTimeMs: Date.now() - startedAt
      };
    } catch (error) {
      lastError = error;
      if (attempt < config.retries) {
        recordErrorRetry();
        await delay(config.retryDelayMs);
      }
    }
  }

  throw lastError;
}

function normalizeForRedirectCompare(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sleepBetweenRequests(baseDelayMs: number): Promise<void> {
  const jitterMs = Math.floor(Math.random() * 2000);
  return delay(baseDelayMs + jitterMs);
}

function recordStatusRetry(status: number): void {
  retryTelemetry.totalRetries += 1;
  retryTelemetry.statusRetries += 1;
  const key = String(status);
  retryTelemetry.retryStatusCounts[key] = (retryTelemetry.retryStatusCounts[key] || 0) + 1;
}

function recordErrorRetry(): void {
  retryTelemetry.totalRetries += 1;
  retryTelemetry.errorRetries += 1;
}

function getBackoffDelayMs(retryAfter: unknown, attempt: number): number {
  const retryAfterSeconds = Number(Array.isArray(retryAfter) ? retryAfter[0] : retryAfter);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return config.retryDelayMs * (attempt + 2);
}
