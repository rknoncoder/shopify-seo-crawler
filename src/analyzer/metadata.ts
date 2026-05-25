import type { CheerioAPI } from "cheerio";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage, MetadataValidationSummary, PageMeta } from "../types/page.js";
import type { ShopifyPageType } from "../types/shopify.js";
import { parseRobotsDirectives } from "../utils/indexability.js";
import { truncate } from "../utils/textUtils.js";

const trackingParams = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^msclkid$/i,
  /^ttclid$/i,
  /^_gl$/i
];

export interface AdvancedMetadataFields {
  htmlLang: string;
  charset: string;
  charsetWithinFirst1024: boolean;
  viewport: string;
  ogPriceAmount: string;
  ogPriceCurrency: string;
  ogAvailability: string;
}

export interface MetadataCanonicalValidation {
  isValid: boolean;
  target: string;
  reason: string;
}

export interface MetadataPriceMismatchResult {
  mismatch: boolean;
  evidence: string;
}

export interface AnalyzeMetadataOptions {
  finalUrl: string;
  pageType: ShopifyPageType;
  meta: PageMeta;
  textSample: string;
  xRobotsTag?: string;
}

export function extractAdvancedMetadataFields($: CheerioAPI, html = ""): AdvancedMetadataFields {
  return {
    htmlLang: compactValue($("html").first().attr("lang") || "", 80),
    charset: compactValue(extractCharset($), 40).toLowerCase(),
    charsetWithinFirst1024: hasUtf8CharsetWithinFirstHeadBytes(html),
    viewport: compactValue(getMetaContent($, ["viewport"]), 300),
    ogPriceAmount: compactValue(getMetaContent($, ["og:price:amount", "product:price:amount"]), 80),
    ogPriceCurrency: compactValue(getMetaContent($, ["og:price:currency", "product:price:currency"]), 20),
    ogAvailability: compactValue(getMetaContent($, ["og:availability", "product:availability"]), 80)
  };
}

export function analyzeMetadata(options: AnalyzeMetadataOptions): MetadataValidationSummary {
  const robots = parseRobotsDirectives(options.meta.robots);
  const xRobots = parseRobotsDirectives(options.xRobotsTag || "");
  const canonical = validateMetadataCanonical(options.meta.canonical, options.finalUrl);
  const priceMismatch = detectMetadataPriceMismatch(options.meta, options.textSample);

  return {
    hasNoIndex: robots.noindex || xRobots.noindex,
    isCanonicalValid: canonical.isValid,
    hasOpenGraphProductData: hasOpenGraphProductData(options.meta, options.pageType),
    ogPriceMismatch: priceMismatch.mismatch,
    hasViewportIssue: hasViewportIssue(options.meta.viewport),
    hreflangCount: countHreflangAlternates(options.meta)
  };
}

export function detectMetadataHreflangDeadLinks(pages: CrawledPage[]): SeoIssue[] {
  const statusByUrl = new Map<string, { status: number; finalUrl: string }>();

  for (const page of pages) {
    const normalized = normalizeUrlForMetadataCompare(page.finalUrl, page.finalUrl);
    if (normalized) {
      statusByUrl.set(normalized, {
        status: page.status,
        finalUrl: page.finalUrl
      });
    }
  }

  const issues: SeoIssue[] = [];

  for (const page of pages) {
    for (const alternate of page.meta.alternates) {
      if (!alternate.hreflang || !alternate.href) continue;

      const normalizedAlternate = normalizeUrlForMetadataCompare(alternate.href, page.finalUrl);
      if (!normalizedAlternate) continue;

      const matchedPage = statusByUrl.get(normalizedAlternate);
      if (!matchedPage || matchedPage.status < 400) continue;

      issues.push({
        url: page.finalUrl,
        pageType: page.pageType,
        severity: "high",
        category: "metadata",
        code: "hreflang_dead_url",
        message: "Hreflang alternate points to a crawled URL that returned an error.",
        recommendation: "Update or remove hreflang alternates that point to 404, blocked, or failed URLs.",
        evidence: truncate(`hreflang=${alternate.hreflang}; href=${matchedPage.finalUrl}; status=${matchedPage.status}`)
      });
    }
  }

  return issues;
}

export function validateMetadataCanonical(canonical: string, finalUrl: string): MetadataCanonicalValidation {
  if (!canonical.trim()) {
    return {
      isValid: false,
      target: "",
      reason: "missing"
    };
  }

  try {
    const target = new URL(canonical, finalUrl);
    if (!["http:", "https:"].includes(target.protocol) || !target.hostname || !target.pathname) {
      return {
        isValid: false,
        target: target.toString(),
        reason: "broken_structure"
      };
    }

    const normalizedTarget = normalizeUrlForMetadataCompare(target.toString(), finalUrl);
    const normalizedCurrent = normalizeUrlForMetadataCompare(finalUrl, finalUrl);
    if (!normalizedTarget || !normalizedCurrent) {
      return {
        isValid: false,
        target: target.toString(),
        reason: "invalid_url"
      };
    }

    if (normalizedTarget === normalizedCurrent || isExpectedShopifyProductCanonical(finalUrl, target.toString())) {
      return {
        isValid: true,
        target: target.toString(),
        reason: "valid"
      };
    }

    return {
      isValid: false,
      target: target.toString(),
      reason: "different_page"
    };
  } catch {
    return {
      isValid: false,
      target: canonical,
      reason: "invalid_url"
    };
  }
}

export function isMissingOrPlaceholderOgImage(meta: PageMeta, pageUrl: string): boolean {
  if (!meta.ogImage) return true;

  try {
    const imageUrl = new URL(meta.ogImage, pageUrl);
    const value = imageUrl.toString().toLowerCase();
    const isPlaceholder = /placeholder|no[-_]?image|missing[-_]?image|default[-_]?image|blank|transparent|spacer|1x1/.test(value);
    const isShopifyCdn = /cdn\.shopify\.com|\/cdn\/shop\//i.test(value);
    return isPlaceholder && !isShopifyCdn;
  } catch {
    return true;
  }
}

export function detectMetadataPriceMismatch(
  meta: Pick<PageMeta, "ogPriceAmount">,
  textSample: string
): MetadataPriceMismatchResult {
  const ogPrice = parsePrice(meta.ogPriceAmount);
  if (ogPrice === null) {
    return {
      mismatch: false,
      evidence: ""
    };
  }

  const visiblePrices = extractVisiblePrices(textSample);
  const mismatch = visiblePrices.length > 0 && !visiblePrices.some((price) => pricesMatch(price, ogPrice));

  return {
    mismatch,
    evidence: mismatch
      ? `ogPrice=${formatPrice(ogPrice)}; visiblePrices=${formatPrices(visiblePrices)}`
      : ""
  };
}

export function hasViewportIssue(viewport: string): boolean {
  return !viewport.trim() || /\buser-scalable\s*=\s*no\b/i.test(viewport);
}

export function hasBlogMaxImagePreviewLarge(robotsContent: string): boolean {
  return parseRobotsDirectives(robotsContent).maxImagePreview.trim().toLowerCase() === "large";
}

function getMetaContent($: CheerioAPI, keys: string[]): string {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  let value = "";

  $("meta").each((_, element) => {
    if (value) return;
    const meta = $(element);
    const nameOrProperty = (meta.attr("name") || meta.attr("property") || "").trim().toLowerCase();
    if (!wanted.has(nameOrProperty)) return;
    value = meta.attr("content") || "";
  });

  return value;
}

function extractCharset($: CheerioAPI): string {
  let value = "";

  $("meta").each((_, element) => {
    if (value) return;
    const meta = $(element);
    const charset = meta.attr("charset");
    if (charset) {
      value = charset;
      return;
    }

    const httpEquiv = (meta.attr("http-equiv") || "").toLowerCase();
    if (httpEquiv !== "content-type") return;

    const content = meta.attr("content") || "";
    const match = content.match(/charset\s*=\s*([^;\s]+)/i);
    if (match?.[1]) value = match[1];
  });

  return value;
}

function hasUtf8CharsetWithinFirstHeadBytes(html: string): boolean {
  if (!html) return false;

  const headStart = html.search(/<head\b/i);
  const start = headStart >= 0 ? headStart : 0;
  const fragment = firstUtf8Bytes(html, start, 1024);
  return /<meta\b[^>]*(?:charset\s*=\s*["']?\s*utf-?8\b|http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*utf-?8\b)/i.test(fragment);
}

function firstUtf8Bytes(value: string, start: number, maxBytes: number): string {
  let end = start;
  let bytes = 0;

  while (end < value.length && bytes < maxBytes) {
    const char = value[end] || "";
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) break;
    bytes += charBytes;
    end += 1;
  }

  return value.slice(start, end);
}

function hasOpenGraphProductData(meta: PageMeta, pageType: ShopifyPageType): boolean {
  const ogType = meta.ogType.toLowerCase();
  return (
    (pageType === "product" || ogType.includes("product")) &&
    Boolean(meta.ogTitle && meta.ogDescription && meta.ogImage && meta.ogPriceAmount && meta.ogPriceCurrency && meta.ogAvailability)
  );
}

function countHreflangAlternates(meta: PageMeta): number {
  return meta.alternates.filter((alternate) => alternate.hreflang.trim()).length;
}

function normalizeUrlForMetadataCompare(value: string, baseUrl: string): string {
  try {
    const parsed = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    parsed.hash = "";

    for (const key of [...parsed.searchParams.keys()]) {
      if (trackingParams.some((pattern) => pattern.test(key))) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.searchParams.sort();
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return "";
  }
}

function isExpectedShopifyProductCanonical(currentUrl: string, canonicalUrl: string): boolean {
  try {
    const current = new URL(currentUrl);
    const canonical = new URL(canonicalUrl, currentUrl);
    if (current.origin !== canonical.origin) return false;

    const currentMatch = current.pathname.match(/^\/collections\/[^/]+\/products\/([^/]+)\/?$/);
    const canonicalMatch = canonical.pathname.match(/^\/products\/([^/]+)\/?$/);
    return Boolean(currentMatch?.[1] && canonicalMatch?.[1] && currentMatch[1] === canonicalMatch[1]);
  } catch {
    return false;
  }
}

function parsePrice(value: string): number | null {
  const match = value.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return null;

  const price = Number.parseFloat(match[1]);
  return Number.isFinite(price) ? price : null;
}

function extractVisiblePrices(text: string): number[] {
  const prices = new Set<number>();
  const patterns = [
    /(?:\u20b9|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
    /([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:inr)/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const price = parsePrice(match[1] || "");
      if (price !== null) prices.add(price);
      if (prices.size >= 20) return [...prices];
    }
  }

  return [...prices];
}

function pricesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.01;
}

function formatPrices(prices: number[]): string {
  return prices.length ? prices.slice(0, 8).map(formatPrice).join("|") : "none";
}

function formatPrice(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

function compactValue(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
