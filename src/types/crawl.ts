import type { CrawledPage } from "./page.js";
import type { SeoIssue } from "./issue.js";

export type CrawlMode = "single" | "seo" | "full";

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
  html: string;
  loadTimeMs: number;
}

export interface CrawlResult {
  pages: CrawledPage[];
  issues: SeoIssue[];
}

export interface SitemapEntry {
  sitemapUrl: string;
  type: "index" | "urlset" | "unknown";
  sitemapType: string;
  urlCount: number;
  selectedForCrawl?: boolean;
}
