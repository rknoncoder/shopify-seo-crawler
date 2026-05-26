import type { CrawlMode } from "../types/crawl.js";
import { normalizeSitemapUrl, normalizeUrl } from "../utils/urlUtils.js";

const validModes = new Set<CrawlMode>(["single", "seo", "full", "discover"]);

export function getCrawlMode(defaultMode: CrawlMode): CrawlMode {
  const cliMode = readCliValue("--mode");
  const envMode = process.env.SHOPIFY_CRAWLER_MODE;
  const mode = (cliMode || envMode || defaultMode) as CrawlMode;
  return validModes.has(mode) ? mode : defaultMode;
}

export function getTargetUrlConfig(defaultUrl: string): { targetUrl: string; source: "cli" | "env" | "config" | "direct_url" } {
  const cliUrl = readCliValue("--url");
  const envUrl = process.env.SHOPIFY_CRAWLER_URL;
  const rawUrl = cliUrl || envUrl || defaultUrl;
  return {
    targetUrl: normalizeUrl(rawUrl),
    source: cliUrl ? "cli" : envUrl ? "env" : "config"
  };
}

export function getSitemapUrls(): string[] {
  const cliSitemaps = readCliValues("--sitemap");
  const envSitemaps = (process.env.SHOPIFY_CRAWLER_SITEMAPS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  return [...cliSitemaps, ...envSitemaps].map((url) => normalizeSitemapUrl(url));
}

export function getNumericOverride(flag: string, envName: string): number | undefined {
  const rawValue = readCliValue(flag) || process.env[envName];
  if (!rawValue) return undefined;
  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function getBooleanOverride(flag: string, envName: string): boolean {
  if (process.argv.includes(flag)) return true;
  const rawValue = process.env[envName];
  return rawValue === "1" || rawValue?.toLowerCase() === "true";
}

export function getStringOverride(flag: string, envName: string): string | undefined {
  return readCliValue(flag) || process.env[envName];
}

function readCliValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function readCliValues(flag: string): string[] {
  return process.argv.reduce<string[]>((values, arg, index) => {
    if (arg === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
    return values;
  }, []);
}
