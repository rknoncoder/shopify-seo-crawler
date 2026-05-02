import type { ShopifyPageType } from "../types/shopify.js";
import { classifyPath } from "../utils/urlUtils.js";

export function classifyPage(url: string): ShopifyPageType {
  return classifyPath(url) as ShopifyPageType;
}
