import type { CheerioAPI } from "cheerio";
import type { ShopifySignals } from "../types/shopify.js";
import { classifyPath, getHandle } from "../utils/urlUtils.js";

export function detectShopify($: CheerioAPI, url: string): ShopifySignals {
  const html = $.html();
  const pageType = classifyPath(url) as ShopifySignals["pageType"];
  const shopDomainMatch = html.match(/Shopify\.shop\s*=\s*["']([^"']+)["']/);
  const themeName = $('meta[name="shopify-digital-wallet"]').length ? "Shopify theme" : undefined;
  const moneyFormatMatch = html.match(/money_format["']?\s*:\s*["']([^"']+)["']/i);

  return {
    isShopify: /cdn\.shopify\.com|Shopify\.theme|Shopify\.shop|myshopify\.com|\/cart\/add/i.test(html),
    shopDomain: shopDomainMatch?.[1],
    themeName,
    moneyFormat: moneyFormatMatch?.[1],
    detectedApps: detectApps(html),
    pageType,
    productHandle: getHandle(url, "products"),
    collectionHandle: getHandle(url, "collections"),
    blogHandle: getHandle(url, "blogs"),
    articleHandle: getArticleHandle(url)
  };
}

function detectApps(html: string): string[] {
  const appSignals: Record<string, RegExp> = {
    Klaviyo: /klaviyo/i,
    Yotpo: /yotpo/i,
    JudgeMe: /judge\.me|judgeme/i,
    Loox: /loox/i,
    Recharge: /recharge/i,
    "Shopify Reviews": /productreviews\.shopifycdn/i,
    Gorgias: /gorgias/i
  };

  return Object.entries(appSignals)
    .filter(([, pattern]) => pattern.test(html))
    .map(([name]) => name);
}

function getArticleHandle(url: string): string | undefined {
  const parts = new URL(url).pathname.split("/").filter(Boolean);
  return parts[0] === "blogs" ? parts[2] : undefined;
}
