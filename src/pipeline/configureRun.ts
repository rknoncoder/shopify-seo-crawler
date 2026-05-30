import config from "../config/config.js";
import { getBooleanOverride, getCrawlMode, getNumericOverride, getSitemapUrls, getStringOverride, getTargetUrlConfig } from "../config/runtimeConfig.js";
import type { CrawlMode } from "../types/crawl.js";
import type { PageSpeedInsightsOptions, PageSpeedStrategy } from "../reports/pageSpeedInsightsReport.js";

export interface RunConfiguration {
  crawlMode: CrawlMode;
  targetUrl: string;
  source: string;
  manualSitemapUrls: string[];
  pageSpeedOptions: PageSpeedInsightsOptions;
  probeOnly: boolean;
}

export interface ExcelExportOptions {
  enabled: boolean;
  reason: string;
}

export function configureRun(): RunConfiguration {
  const crawlMode = getCrawlMode(config.crawlMode);
  applyCrawlMode(crawlMode);
  applyNumericOverrides();

  const { targetUrl, source } = getTargetUrlConfig(config.startUrl);

  return {
    crawlMode,
    targetUrl,
    source,
    manualSitemapUrls: getSitemapUrls(),
    pageSpeedOptions: getPageSpeedInsightsOptions(),
    probeOnly: getBooleanOverride("--probe-only", "SHOPIFY_CRAWLER_PROBE_ONLY")
  };
}

export function getExcelExportOptions(pageCount: number): ExcelExportOptions {
  if (getBooleanOverride("--no-excel", "SHOPIFY_CRAWLER_NO_EXCEL")) {
    return { enabled: false, reason: "--no-excel was set." };
  }

  if (getBooleanOverride("--memory-safe", "SHOPIFY_CRAWLER_MEMORY_SAFE")) {
    return { enabled: false, reason: "memory-safe mode skips Excel; CSV/JSON reports were still written." };
  }

  if (getBooleanOverride("--excel", "SHOPIFY_CRAWLER_EXCEL")) {
    return { enabled: true, reason: "--excel was set." };
  }

  const maxExcelPages = getNumericOverride("--excel-max-pages", "SHOPIFY_CRAWLER_EXCEL_MAX_PAGES") ?? 1500;
  if (pageCount > maxExcelPages) {
    return {
      enabled: false,
      reason: `page count ${pageCount} is above Excel auto limit ${maxExcelPages}; use --excel to force it.`
    };
  }

  return { enabled: true, reason: "within Excel auto limit." };
}

function applyCrawlMode(crawlMode: CrawlMode): void {
  const modeConfig = config.crawlModes[crawlMode];
  config.crawlMode = crawlMode;
  config.maxPages = modeConfig.maxPages ?? config.maxPages;
  config.maxDepth = modeConfig.maxDepth ?? config.maxDepth;
  if (modeConfig.excludedPathPatterns) config.crawl.excludedPathPatterns = modeConfig.excludedPathPatterns;
  if (modeConfig.sitemapSelection) config.sitemapSelection = modeConfig.sitemapSelection;
}

function applyNumericOverrides(): void {
  config.maxPages = getNumericOverride("--max-pages", "SHOPIFY_CRAWLER_MAX_PAGES") ?? config.maxPages;
  config.maxDepth = getNumericOverride("--max-depth", "SHOPIFY_CRAWLER_MAX_DEPTH") ?? config.maxDepth;

  if (getBooleanOverride("--memory-safe", "SHOPIFY_CRAWLER_MEMORY_SAFE")) {
    config.storage.maxStoredLinksPerPage = 60;
    config.storage.maxStoredImagesPerPage = 20;
    config.storage.maxStoredTextSampleChars = 1000;
  }

  config.storage.maxStoredLinksPerPage = getNumericOverride("--max-stored-links", "SHOPIFY_CRAWLER_MAX_STORED_LINKS") ?? config.storage.maxStoredLinksPerPage;
  config.storage.maxStoredImagesPerPage = getNumericOverride("--max-stored-images", "SHOPIFY_CRAWLER_MAX_STORED_IMAGES") ?? config.storage.maxStoredImagesPerPage;
  config.storage.maxStoredTextSampleChars = getNumericOverride("--max-stored-text", "SHOPIFY_CRAWLER_MAX_STORED_TEXT") ?? config.storage.maxStoredTextSampleChars;
}

function getPageSpeedInsightsOptions(): PageSpeedInsightsOptions {
  const rawStrategy = (getStringOverride("--pagespeed-strategy", "SHOPIFY_CRAWLER_PAGESPEED_STRATEGY") || "mobile").toLowerCase();
  const strategy: PageSpeedStrategy = rawStrategy === "desktop" ? "desktop" : "mobile";

  return {
    enabled: getBooleanOverride("--pagespeed", "SHOPIFY_CRAWLER_PAGESPEED"),
    limit: getNumericOverride("--pagespeed-limit", "SHOPIFY_CRAWLER_PAGESPEED_LIMIT") ?? 10,
    strategy,
    apiKey: getStringOverride("--pagespeed-key", "PAGESPEED_API_KEY") || process.env.SHOPIFY_CRAWLER_PAGESPEED_KEY
  };
}
