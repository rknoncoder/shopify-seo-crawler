import type { ShopifyPageType } from "./shopify.js";

export interface ImageInventoryUsage {
  imageUrl: string;
  rawSrc: string;
  alt: string;
  pageUrl: string;
  pageType: ShopifyPageType;
  width: string;
  height: string;
  lazy: boolean;
  fetchPriority: string;
}
