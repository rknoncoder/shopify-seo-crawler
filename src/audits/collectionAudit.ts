import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { countWords, truncate } from "../utils/textUtils.js";
import { isCollectionUrl, isShopifyTagUrl } from "../utils/urlUtils.js";

const genericCollectionTitles = [
  /^all$/i,
  /^all products$/i,
  /^catalog$/i,
  /^collection$/i,
  /^collections$/i,
  /^products$/i,
  /^new arrivals$/i
];

const boilerplateMetaPatterns = [
  /welcome to our store/i,
  /best online shopping/i,
  /buy now online/i,
  /fastest delivery/i,
  /free shipping/i,
  /cash on delivery/i,
  /clearance sale/i
];

const faqPatterns = [
  /\bfaq\b/i,
  /frequently asked/i,
  /what size/i,
  /how to choose/i,
  /how do i/i
];

export function auditCollection(page: CrawledPage): SeoIssue[] {
  if (page.pageType !== "collection") return [];

  const issues: SeoIssue[] = [];
  const productLinkSummary = summarizeProductLinks(page);

  if (page.wordCount < 100) {
    issues.push(issue(page, "medium", "content", "thin_collection_content", "Collection page has very little crawlable copy.", "Add unique intro copy, buying guidance, FAQs, and internal links."));
  }

  addCollectionTitleIssues(page, issues);
  addCollectionMetaIssues(page, issues);
  addCollectionSchemaIssues(page, issues);
  addCollectionFaqIssues(page, issues);
  addCollectionProductLinkIssues(page, issues, productLinkSummary);
  addCollectionFacetIssues(page, issues);

  const productCount = productLinkSummary.uniqueProductLinks;
  if (isCollectionUrl(page.finalUrl) && productCount <= 1) {
    issues.push(issue(
      page,
      "medium",
      "shopify",
      "thin_collection_product_count",
      `Collection page has ${productCount} crawlable product link${productCount === 1 ? "" : "s"}.`,
      "Add more relevant products to the collection or noindex/remove thin collection pages.",
      `productLinks=${productCount}`
    ));
  }

  if (isIndexableTagUrl(page)) {
    issues.push(issue(
      page,
      "medium",
      "shopify",
      "indexable_collection_tag_url",
      "Shopify collection tag URL appears indexable.",
      "Noindex tag-filter pages or canonicalize them to the clean collection URL to avoid tag bloat.",
      `robots=${page.meta.robots || "empty"}; canonical=${page.meta.canonical || "missing"}`
    ));
  }

  return issues;
}

interface ProductLinkSummary {
  totalProductLinks: number;
  uniqueProductLinks: number;
}

function summarizeProductLinks(page: CrawledPage): ProductLinkSummary {
  const handles = new Set<string>();
  let totalProductLinks = 0;

  for (const link of page.links) {
    let parts: string[];
    try {
      parts = new URL(link.href).pathname.split("/").filter(Boolean);
    } catch {
      continue;
    }

    const productIndex = parts.indexOf("products");
    const handle = productIndex >= 0 ? parts[productIndex + 1] : undefined;
    if (handle) {
      totalProductLinks += 1;
      handles.add(handle);
    }
  }

  return {
    totalProductLinks,
    uniqueProductLinks: handles.size
  };
}

function addCollectionTitleIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const title = stripBrand(page.meta.title);
  const h1 = page.headings.h1[0] || "";

  if (genericCollectionTitles.some((pattern) => pattern.test(title)) || genericCollectionTitles.some((pattern) => pattern.test(h1))) {
    issues.push(issue(
      page,
      "recommended",
      "metadata",
      "collection_title_too_generic",
      "Collection title or H1 is too generic.",
      "Use a specific collection title that describes the category and search intent.",
      `title=${title}; h1=${h1}`
    ));
  }
}

function addCollectionMetaIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const description = page.meta.description;
  if (!description) return;

  if (boilerplateMetaPatterns.some((pattern) => pattern.test(description))) {
    issues.push(issue(
      page,
      "recommended",
      "metadata",
      "collection_meta_description_boilerplate",
      "Collection meta description contains common boilerplate wording.",
      "Write a unique collection description that explains product type, benefits, use cases, and selection guidance.",
      description
    ));
  }
}

function addCollectionSchemaIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const schemaTypes = page.schemas.flatMap((schema) => schema.type.split(",").map((type) => type.trim()));

  if (!schemaTypes.includes("ItemList")) {
    issues.push(issue(
      page,
      "recommended",
      "schema",
      "collection_missing_itemlist_schema",
      "Collection page is missing ItemList schema.",
      "Add ItemList JSON-LD that lists visible collection products, if this matches your schema strategy.",
      schemaTypes.join("|") || "No schema found"
    ));
  }
}

function addCollectionFaqIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const hasFaqSchema = page.schemas.some((schema) => schema.type.split(",").map((type) => type.trim()).includes("FAQPage"));
  const hasFaqText = faqPatterns.some((pattern) => pattern.test(page.textSample));

  if (!hasFaqSchema && !hasFaqText) {
    issues.push(issue(
      page,
      "recommended",
      "content",
      "collection_missing_faq_content",
      "Collection page does not expose FAQ content.",
      "Add helpful FAQs around sizing, fit, material, styling, delivery, and returns when useful for the category.",
      page.headings.h1[0] || page.meta.title
    ));
  }
}

function addCollectionProductLinkIssues(page: CrawledPage, issues: SeoIssue[], summary: ProductLinkSummary): void {
  if (summary.totalProductLinks === 0) {
    issues.push(issue(
      page,
      "high",
      "shopify",
      "collection_no_product_links",
      "Collection page has no crawlable product links.",
      "Make sure collection product cards are rendered as crawlable HTML links.",
      "productLinks=0"
    ));
    return;
  }

  if (summary.totalProductLinks >= 10 && summary.uniqueProductLinks / summary.totalProductLinks < 0.5) {
    issues.push(issue(
      page,
      "recommended",
      "shopify",
      "collection_excessive_duplicate_product_links",
      "Collection page repeats many product links.",
      "Reduce duplicate product card links or repeated variant links so the collection page has a cleaner crawl path.",
      `totalProductLinks=${summary.totalProductLinks}; uniqueProductLinks=${summary.uniqueProductLinks}`
    ));
  }
}

function addCollectionFacetIssues(page: CrawledPage, issues: SeoIssue[]): void {
  const rawFacetLinks = page.links.filter((link) => /(?:\?|&)(?:sort_by|filter\.|page)=/i.test(link.rawHref));

  if (rawFacetLinks.length > 0) {
    issues.push(issue(
      page,
      "recommended",
      "faceted_navigation",
      "collection_sort_filter_links_crawlable",
      "Collection page exposes crawlable sort, filter, or pagination links.",
      "Keep filtered/sorted states canonicalized and avoid allowing excessive crawlable URL combinations.",
      rawFacetLinks.slice(0, 5).map((link) => link.rawHref).join(" | ")
    ));
  }
}

function isIndexableTagUrl(page: CrawledPage): boolean {
  if (!isShopifyTagUrl(page.finalUrl)) return false;
  return !page.meta.robots.toLowerCase().includes("noindex");
}

function stripBrand(title: string): string {
  return title
    .replace(/\s+(?:-|\u2013|\u2014)\s+TRIPR\s*$/i, "")
    .replace(/\s+(?:-|\u2013|\u2014)\s+Tripr India\s*$/i, "")
    .trim();
}

function issue(
  page: CrawledPage,
  severity: SeoIssue["severity"],
  category: SeoIssue["category"],
  code: string,
  message: string,
  recommendation: string,
  evidence = ""
): SeoIssue {
  return {
    url: page.finalUrl,
    pageType: page.pageType,
    severity,
    category,
    code,
    message,
    recommendation,
    evidence: truncate(evidence || `wordCount=${countWords(page.textSample)}`)
  };
}
