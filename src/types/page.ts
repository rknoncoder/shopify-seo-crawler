import type { StructuredDataItem } from "./schema.js";
import type { ShopifyPageType, ShopifySignals } from "./shopify.js";

export interface HeadingSummary {
  h1: string[];
  h2: string[];
  h3: string[];
}

export interface ImageInfo {
  src: string;
  alt: string;
  width?: string;
  height?: string;
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

export interface CrawledPage {
  url: string;
  finalUrl: string;
  status: number;
  depth: number;
  contentType: string;
  fetchedAt: string;
  loadTimeMs: number;
  pageType: ShopifyPageType;
  meta: PageMeta;
  headings: HeadingSummary;
  wordCount: number;
  textHash: string;
  images: ImageInfo[];
  links: LinkInfo[];
  schemas: StructuredDataItem[];
  shopify: ShopifySignals;
  issues: string[];
}
