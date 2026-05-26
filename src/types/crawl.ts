import type { CrawledPage } from "./page.js";
import type { HttpHeaderMetadata } from "./page.js";
import type { ImageInventoryUsage } from "./image.js";
import type { SeoIssue } from "./issue.js";

export type CrawlMode = "single" | "seo" | "full" | "discover";

export interface CrawlConfig {
  startUrl: string;
  crawlMode: CrawlMode;
  maxPages: number;
  maxDepth: number;
  timeout: number;
  concurrency: number;
  crawlDelayMs: number;
  userAgent: string;
  retries: number;
  retryDelayMs: number;
  storage: {
    maxStoredLinksPerPage: number;
    maxStoredImagesPerPage: number;
    maxStoredTextSampleChars: number;
  };
  crawl: {
    sameOriginOnly: boolean;
    keepQueryStrings: boolean;
    excludedPathPatterns: string[];
    excludedExtensions: string[];
  };
  sitemapSelection: {
    crawlAll: boolean;
    includePatterns: string[];
    excludePatterns: string[];
  };
  crawlModes: Record<CrawlMode, Partial<Pick<CrawlConfig, "maxPages" | "maxDepth">> & {
    excludedPathPatterns?: string[];
    sitemapSelection?: CrawlConfig["sitemapSelection"];
  }>;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  redirected: boolean;
  redirectCount: number;
  status: number;
  contentType: string;
  http: HttpHeaderMetadata;
  html: string;
  loadTimeMs: number;
}

export interface CrawlRetryTelemetry {
  totalRetries: number;
  statusRetries: number;
  errorRetries: number;
  retryStatusCounts: Record<string, number>;
}

export interface CrawlTelemetry {
  totalRequested: number;
  skippedNonHtmlCount: number;
  retries: CrawlRetryTelemetry;
}

export interface CrawlResult {
  pages: CrawledPage[];
  issues: SeoIssue[];
  imageInventoryUsages: ImageInventoryUsage[];
  telemetry: CrawlTelemetry;
}

export interface SitemapEntry {
  sitemapUrl: string;
  type: "index" | "urlset" | "unknown";
  sitemapType: string;
  urlCount: number;
  selectedForCrawl?: boolean;
}
