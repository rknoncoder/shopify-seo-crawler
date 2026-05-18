import type { StructuredDataItem } from "./schema.js";
import type { ShopifyPageType, ShopifySignals } from "./shopify.js";

export interface HeadingSummary {
  h1: string[];
  h2: string[];
  h3: string[];
}

export interface ImageInfo {
  src: string;
  rawSrc: string;
  alt: string;
  width?: string;
  height?: string;
  fetchPriority?: string;
  lazy: boolean;
}

export interface LinkInfo {
  href: string;
  rawHref: string;
  text: string;
  rel: string[];
  internal: boolean;
  status?: number;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  twitterTitle: string;
  twitterDescription: string;
}

export interface HttpHeaderMetadata {
  xRobotsTag: string;
  contentType: string;
  lastModified: string;
  etag: string;
  cacheControl: string;
  server: string;
  cfCacheStatus: string;
  cdnCacheStatus: string;
  contentLength: string;
  responseSizeBytes: number;
}

export interface PageSpeedSignals {
  htmlSizeKb: number;
  domElementCount: number;
  scriptCount: number;
  externalScriptCount: number;
  thirdPartyScriptCount: number;
  shopifyAppScriptCount: number;
  stylesheetCount: number;
  renderBlockingStylesheetCount: number;
  imageCount: number;
  largeImageUrlCount: number;
  preloadedImageCount: number;
  primaryImageFetchPriority: string;
  primaryImageLazy: boolean;
  thirdPartyScriptHosts: string[];
  shopifyAppScriptHosts: string[];
}

export interface CrawledPage {
  url: string;
  finalUrl: string;
  redirected: boolean;
  redirectCount: number;
  status: number;
  depth: number;
  contentType: string;
  http: HttpHeaderMetadata;
  fetchedAt: string;
  loadTimeMs: number;
  pageType: ShopifyPageType;
  meta: PageMeta;
  headings: HeadingSummary;
  wordCount: number;
  textSample: string;
  textHash: string;
  images: ImageInfo[];
  links: LinkInfo[];
  schemas: StructuredDataItem[];
  shopify: ShopifySignals;
  speed: PageSpeedSignals;
  issues: string[];
}
