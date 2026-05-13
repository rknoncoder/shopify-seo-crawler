import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

const brandWords = new Set(["tripr", "india", "shopify"]);
const commerceWords = new Set([
  "buy",
  "shop",
  "online",
  "men",
  "mens",
  "women",
  "kids",
  "tshirt",
  "tshirts",
  "shirt",
  "shirts",
  "pants",
  "track",
  "jogger",
  "joggers",
  "shorts",
  "vest",
  "combo",
  "pack",
  "hoodie",
  "jacket",
  "collection",
  "sale"
]);

const genericTitlePatterns = [
  /^home$/i,
  /^products?$/i,
  /^collections?$/i,
  /^catalog$/i,
  /^untitled$/i
];

const boilerplateDescriptionPatterns = [
  /welcome to our store/i,
  /powered by shopify/i,
  /shopify store/i,
  /best online shopping/i,
  /buy now online/i,
  /fastest delivery/i,
  /free shipping/i,
  /cash on delivery/i
];

export function auditSerpSnippet(page: CrawledPage): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const title = stripBrandSuffix(page.meta.title);
  const h1 = page.headings.h1[0] || "";
  const description = page.meta.description;

  if (title) {
    addTitleQualityIssues(page, issues, title, h1);
  }

  if (description) {
    addDescriptionQualityIssues(page, issues, description, title, h1);
  }

  return issues;
}

function addTitleQualityIssues(page: CrawledPage, issues: SeoIssue[], title: string, h1: string): void {
  const titleWords = meaningfulWords(title);

  if (genericTitlePatterns.some((pattern) => pattern.test(title))) {
    issues.push(issue(
      page,
      "high",
      "serp_generic_title",
      "Title tag is too generic for search snippets.",
      "Write a specific title that describes the product, collection, article, or page.",
      title
    ));
  }

  if (titleWords.length > 0 && titleWords.every((word) => brandWords.has(word))) {
    issues.push(issue(
      page,
      "medium",
      "serp_brand_only_title",
      "Title tag is mostly brand-only.",
      "Add page-specific keywords before the brand name.",
      title
    ));
  }

  if (["product", "collection"].includes(page.pageType) && !titleWords.some((word) => commerceWords.has(word))) {
    issues.push(issue(
      page,
      "recommended",
      "serp_title_missing_commerce_terms",
      "Title tag may be missing useful product or collection terms.",
      "Include clear category, product type, or shopping intent terms in the title.",
      title
    ));
  }

  if (h1 && !textsOverlapEnough(title, h1)) {
    issues.push(issue(
      page,
      "recommended",
      "serp_title_h1_mismatch",
      "Title tag and H1 target different wording.",
      "Keep the title and H1 aligned while allowing the title to include brand or offer terms.",
      `title=${title}; h1=${h1}`
    ));
  }
}

function addDescriptionQualityIssues(page: CrawledPage, issues: SeoIssue[], description: string, title: string, h1: string): void {
  const normalizedDescription = normalizeText(description);

  if (boilerplateDescriptionPatterns.some((pattern) => pattern.test(description))) {
    issues.push(issue(
      page,
      "recommended",
      "serp_boilerplate_meta_description",
      "Meta description contains common boilerplate wording.",
      "Write a unique description focused on this page's product, collection, benefit, or search intent.",
      description
    ));
  }

  if (title && normalizeText(title) === normalizedDescription) {
    issues.push(issue(
      page,
      "medium",
      "serp_description_duplicates_title",
      "Meta description duplicates the title.",
      "Use the description to add supporting details, benefits, and intent instead of repeating the title.",
      description
    ));
  }

  if (h1 && normalizeText(h1) === normalizedDescription) {
    issues.push(issue(
      page,
      "medium",
      "serp_description_duplicates_h1",
      "Meta description duplicates the H1.",
      "Use the description to summarize the page with more detail than the visible heading.",
      description
    ));
  }

  if (page.pageType === "product" && !mentionsAny(description, ["fabric", "cotton", "fit", "size", "combo", "pack", "price", "color", "colour", "delivery"])) {
    issues.push(issue(
      page,
      "recommended",
      "serp_product_description_missing_detail",
      "Product meta description may lack useful shopping details.",
      "Mention specific product benefits such as fabric, fit, pack size, color, price, or delivery where accurate.",
      description
    ));
  }
}

function stripBrandSuffix(title: string): string {
  return title
    .replace(/\s+(?:-|\u2013|\u2014)\s+TRIPR\s*$/i, "")
    .replace(/\s+(?:-|\u2013|\u2014)\s+Tripr India\s*$/i, "")
    .trim();
}

function meaningfulWords(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word.length > 2);
}

function textsOverlapEnough(left: string, right: string): boolean {
  const leftWords = new Set(meaningfulWords(left));
  const rightWords = meaningfulWords(right);
  if (leftWords.size === 0 || rightWords.length === 0) return true;

  const overlap = rightWords.filter((word) => leftWords.has(word)).length;
  return overlap / rightWords.length >= 0.5;
}

function mentionsAny(value: string, words: string[]): boolean {
  const normalized = normalizeText(value);
  return words.some((word) => normalized.includes(word));
}

function normalizeText(value: string): string {
  return value
    .replace(/&amp;/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function issue(
  page: CrawledPage,
  severity: SeoIssue["severity"],
  code: string,
  message: string,
  recommendation: string,
  evidence = ""
): SeoIssue {
  return {
    url: page.finalUrl,
    pageType: page.pageType,
    severity,
    category: "serp_snippet",
    code,
    message,
    recommendation,
    evidence: truncate(evidence, 220)
  };
}
