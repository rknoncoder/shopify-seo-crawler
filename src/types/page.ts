import type { ShopifyPageType, ShopifySignals } from "./shopify.js";

export type DiscoverySource = "api_probe" | "pagination_probe" | "sitemap_unlisted";

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

export interface AlternateLinkInfo {
  href: string;
  hreflang: string;
  type: string;
  title: string;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  htmlLang: string;
  charset: string;
  charsetWithinFirst1024: boolean;
  viewport: string;
  alternates: AlternateLinkInfo[];
  hreflangLanguages: string[];
  ogTitle: string;
  ogDescription: string;
  ogType: string;
  ogUrl: string;
  ogImage: string;
  ogImageWidth: string;
  ogImageHeight: string;
  ogPriceAmount: string;
  ogPriceCurrency: string;
  ogAvailability: string;
  twitterCard: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
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

export interface MetadataValidationSummary {
  hasNoIndex: boolean;
  isCanonicalValid: boolean;
  hasOpenGraphProductData: boolean;
  ogPriceMismatch: boolean;
  hasViewportIssue: boolean;
  hreflangCount: number;
}

export interface CrawledPage {
  url: string;
  finalUrl: string;
  discoverySource?: DiscoverySource;
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
  shopify: ShopifySignals;
  speed: PageSpeedSignals;
  metadataValidation: MetadataValidationSummary;
  issues: string[];
}
