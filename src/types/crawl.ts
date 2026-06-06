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
  apiSeededProducts: number;
  apiSeededCollections: number;
  probeDiscoveredProducts: number;
  probeCollectionsAttempted: number;
  probeCollectionsExhausted: number;
  probeCollectionsFailed: number;
  probeTotalPagesFetched: number;
  sitemapOnlyProducts: number;
  retries: CrawlRetryTelemetry;
}

export interface CrawlResult {
  pages: CrawledPage[];
  issues: SeoIssue[];
  imageInventoryUsages: ImageInventoryUsage[];
  linkGraph: LinkGraph;
  probeDiscoveryMap: ProbeDiscoveryMap;
  collectionProbeSummaries: CollectionProbeSummary[];
  telemetry: CrawlTelemetry;
}

export interface SitemapEntry {
  sitemapUrl: string;
  type: "index" | "urlset" | "unknown";
  sitemapType: string;
  urlCount: number;
  selectedForCrawl?: boolean;
}

export interface QueuedUrl {
  url: string;
  depth: number;
  discoverySource?: CrawledPage["discoverySource"];
}

export type LinkGraph = Map<string, Set<string>>;
export type ProbeDiscoveryMap = Map<string, Set<string>>;

export interface CollectionProbeSummary {
  handle: string;
  url: string;
  attempted: number;
  exhausted: number;
  failed: number;
  probe_pages_fetched: number;
  products_found: number;
  discovered_products: number;
  stop_reason: string;
  pages: Array<{
    page: number;
    products_found: number;
    new: number;
  }>;
}
