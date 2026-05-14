import type { CheerioAPI } from "cheerio";
import type { ImageInfo, PageSpeedSignals } from "../types/page.js";

const shopifyCoreHosts = [
  "cdn.shopify.com",
  "shopifycdn.net",
  "shopify.com",
  "myshopify.com"
];

const appScriptPatterns = [
  /judge\.me|judgeme/i,
  /loox/i,
  /yotpo/i,
  /stamped/i,
  /okendo/i,
  /klaviyo/i,
  /gorgias/i,
  /recharge/i,
  /aftership/i,
  /shopifycloud/i,
  /app/i
];

export function extractSpeedSignals($: CheerioAPI, html: string, pageUrl: string, images: ImageInfo[]): PageSpeedSignals {
  const baseOrigin = new URL(pageUrl).origin;
  const scripts = $("script");
  const externalScriptUrls = scripts
    .map((_, element) => $(element).attr("src") || "")
    .get()
    .filter(Boolean)
    .map((src) => normalizeUrl(src, pageUrl))
    .filter(Boolean);

  const thirdPartyHosts = uniqueHosts(externalScriptUrls.filter((url) => isThirdPartyScript(url, baseOrigin)));
  const appScriptHosts = uniqueHosts(externalScriptUrls.filter((url) => isShopifyAppScript(url)));
  const stylesheets = $('link[rel~="stylesheet"]');
  const renderBlockingStylesheets = stylesheets.filter((_, element) => {
    const media = ($(element).attr("media") || "").trim().toLowerCase();
    return !media || media === "all" || media === "screen";
  });
  const primaryImage = findPrimaryImage(images);

  return {
    htmlSizeKb: Math.round(Buffer.byteLength(html, "utf8") / 1024),
    domElementCount: $("*").length,
    scriptCount: scripts.length,
    externalScriptCount: externalScriptUrls.length,
    thirdPartyScriptCount: thirdPartyHosts.length,
    shopifyAppScriptCount: appScriptHosts.length,
    stylesheetCount: stylesheets.length,
    renderBlockingStylesheetCount: renderBlockingStylesheets.length,
    imageCount: images.length,
    largeImageUrlCount: images.filter(hasLargeImageWidthParam).length,
    preloadedImageCount: $('link[rel="preload"][as="image"], link[rel="preload"][imagesrcset]').length,
    primaryImageFetchPriority: primaryImage?.fetchPriority || "",
    primaryImageLazy: primaryImage?.lazy || false,
    thirdPartyScriptHosts: thirdPartyHosts,
    shopifyAppScriptHosts: appScriptHosts
  };
}

function normalizeUrl(src: string, baseUrl: string): string {
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return "";
  }
}

function isThirdPartyScript(url: string, baseOrigin: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin === baseOrigin) return false;
    return !shopifyCoreHosts.some((host) => parsed.hostname.includes(host));
  } catch {
    return false;
  }
}

function isShopifyAppScript(url: string): boolean {
  try {
    const parsed = new URL(url);
    const target = `${parsed.hostname}${parsed.pathname}`;
    return appScriptPatterns.some((pattern) => pattern.test(target)) && !parsed.hostname.includes("cdn.shopify.com");
  } catch {
    return false;
  }
}

function uniqueHosts(urls: string[]): string[] {
  return [...new Set(urls.map((url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }).filter(Boolean))];
}

function hasLargeImageWidthParam(image: ImageInfo): boolean {
  try {
    const width = Number(new URL(image.src).searchParams.get("width"));
    return Number.isFinite(width) && width >= 1600;
  } catch {
    return false;
  }
}

function findPrimaryImage(images: ImageInfo[]): ImageInfo | undefined {
  return images.find((image) => {
    const source = `${image.src} ${image.rawSrc}`.toLowerCase();
    if (source.includes("logo") || source.includes("icon") || source.includes("payment")) return false;
    if (source.includes("/preview_images/")) return false;
    return source.includes("/cdn/shop/files/") || source.includes("/cdn/shop/products/");
  });
}
