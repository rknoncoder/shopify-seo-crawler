import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { getShopifyProductCanonicalUrl, isShopifyCollectionProductUrl } from "../utils/urlUtils.js";

export function auditShopifyProduct(page: CrawledPage): SeoIssue[] {
  if (page.pageType !== "product") return [];
  if (page.status !== 200) return [];

  const issues: SeoIssue[] = [];
  const schemaTypes = page.schemas.map((schema) => schema.type).join(",");

  const duplicateProductUrlIssue = auditDuplicateProductUrlCanonical(page);
  if (duplicateProductUrlIssue) {
    issues.push(duplicateProductUrlIssue);
  }

  if (!/Product/i.test(schemaTypes)) {
    issues.push(issue(page, "high", "schema", "product_schema_missing", "Product page is missing Product schema.", "Add Product JSON-LD with offers, price, availability, image, and reviews where available."));
  }

  if (!/Offer/i.test(JSON.stringify(page.schemas.map((schema) => schema.raw)))) {
    issues.push(issue(page, "medium", "schema", "product_offer_missing", "Product schema does not expose Offer data.", "Include priceCurrency, price, availability, and url in Product offers."));
  }

  if (page.wordCount < 150) {
    issues.push(issue(page, "medium", "content", "thin_product_content", "Product page has thin visible content.", "Add unique product copy, benefits, specs, sizing, FAQs, and care details."));
  }

  if (page.images.length === 0) {
    issues.push(issue(page, "medium", "images", "product_images_missing", "Product page has no crawlable images.", "Make product images available in HTML with descriptive alt text."));
  }

  return issues;
}

function issue(page: CrawledPage, severity: SeoIssue["severity"], category: SeoIssue["category"], code: string, message: string, recommendation: string): SeoIssue {
  return { url: page.finalUrl, pageType: page.pageType, severity, category, code, message, recommendation };
}

function auditDuplicateProductUrlCanonical(page: CrawledPage): SeoIssue | undefined {
  if (!isShopifyCollectionProductUrl(page.finalUrl)) return undefined;

  const expectedCanonical = getShopifyProductCanonicalUrl(page.finalUrl);
  if (!expectedCanonical) return undefined;

  const actualCanonical = normalizeCanonical(page.meta.canonical, page.finalUrl);

  if (actualCanonical === expectedCanonical) return undefined;

  return {
    url: page.finalUrl,
    pageType: page.pageType,
    severity: "high",
    category: "shopify",
    code: "duplicate_product_url_bad_canonical",
    message: "Collection product duplicate URL does not canonicalize to the clean product URL.",
    recommendation: "Set the canonical tag to the primary /products/{handle} URL for Shopify collection-product paths.",
    evidence: `expected=${expectedCanonical}; actual=${actualCanonical || "missing"}`
  };
}

function normalizeCanonical(canonical: string, baseUrl: string): string {
  if (!canonical) return "";

  try {
    return new URL(canonical, baseUrl).toString().replace(/\/$/, "");
  } catch {
    return canonical;
  }
}
