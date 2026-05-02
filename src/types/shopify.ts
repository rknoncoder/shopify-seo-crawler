export type ShopifyPageType =
  | "home"
  | "product"
  | "collection"
  | "blog"
  | "article"
  | "page"
  | "policy"
  | "cart"
  | "search"
  | "account"
  | "unknown";

export interface ShopifySignals {
  isShopify: boolean;
  shopDomain?: string;
  themeName?: string;
  moneyFormat?: string;
  detectedApps: string[];
  pageType: ShopifyPageType;
  productHandle?: string;
  collectionHandle?: string;
  blogHandle?: string;
  articleHandle?: string;
}
