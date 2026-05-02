import type { ShopifyPageType } from "../types/shopify.js";

export function expectedSchemaTypesForPage(pageType: ShopifyPageType): string[] {
  const expectations: Record<ShopifyPageType, string[]> = {
    home: ["Organization", "WebSite"],
    product: ["Product"],
    collection: ["CollectionPage", "ItemList"],
    blog: ["Blog"],
    article: ["Article", "BlogPosting"],
    page: ["WebPage"],
    policy: ["WebPage"],
    cart: [],
    search: [],
    account: [],
    unknown: []
  };

  return expectations[pageType] || [];
}
