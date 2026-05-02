import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { isCollectionUrl, isShopifyTagUrl } from "../utils/urlUtils.js";

export function auditCollection(page: CrawledPage): SeoIssue[] {
  if (page.pageType !== "collection") return [];

  const issues: SeoIssue[] = [];

  if (page.wordCount < 100) {
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "medium",
      category: "content",
      code: "thin_collection_content",
      message: "Collection page has very little crawlable copy.",
      recommendation: "Add unique intro copy, buying guidance, FAQs, and internal links."
    });
  }

  const productCount = countUniqueProductLinks(page);
  if (isCollectionUrl(page.finalUrl) && productCount <= 1) {
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "medium",
      category: "shopify",
      code: "thin_collection_product_count",
      message: `Collection page has ${productCount} crawlable product link${productCount === 1 ? "" : "s"}.`,
      recommendation: "Add more relevant products to the collection or noindex/remove thin collection pages.",
      evidence: `productLinks=${productCount}`
    });
  }

  if (isIndexableTagUrl(page)) {
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "medium",
      category: "shopify",
      code: "indexable_collection_tag_url",
      message: "Shopify collection tag URL appears indexable.",
      recommendation: "Noindex tag-filter pages or canonicalize them to the clean collection URL to avoid tag bloat.",
      evidence: `robots=${page.meta.robots || "empty"}; canonical=${page.meta.canonical || "missing"}`
    });
  }

  return issues;
}

function countUniqueProductLinks(page: CrawledPage): number {
  const handles = new Set<string>();

  for (const link of page.links) {
    const parts = new URL(link.href).pathname.split("/").filter(Boolean);
    const productIndex = parts.indexOf("products");
    const handle = productIndex >= 0 ? parts[productIndex + 1] : undefined;
    if (handle) handles.add(handle);
  }

  return handles.size;
}

function isIndexableTagUrl(page: CrawledPage): boolean {
  if (!isShopifyTagUrl(page.finalUrl)) return false;
  return !page.meta.robots.toLowerCase().includes("noindex");
}
