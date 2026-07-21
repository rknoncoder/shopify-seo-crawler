import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { summarizeIndexability } from "../utils/indexability.js";
import { truncate } from "../utils/textUtils.js";

const reviewSignals = [
  /judgeme/i,
  /judge\.me/i,
  /review/i,
  /rating/i,
  /aggregateRating/i,
  /stamped/i,
  /loox/i,
  /yotpo/i,
  /okendo/i
];

const faqSignals = [
  /\bfaq\b/i,
  /frequently asked/i,
  /question/i,
  /acceptedAnswer/i
];

const materialSignals = [
  /fabric/i,
  /cotton/i,
  /polyester/i,
  /blend/i,
  /material/i,
  /gsm/i,
  /denim/i,
  /fleece/i
];

const sizeSignals = [
  /size/i,
  /sizing/i,
  /size chart/i,
  /\bS\b|\bM\b|\bL\b|\bXL\b|\bXXL\b|2XL/i
];

const careSignals = [
  /wash/i,
  /machine wash/i,
  /fabric care/i,
  /care/i,
  /do not bleach/i,
  /dry/i
];

export function auditShopifyProductSeo(page: CrawledPage): SeoIssue[] {
  if (page.pageType !== "product" || page.status !== 200) return [];

  const issues: SeoIssue[] = [];
  const searchableText = buildSearchableText(page);
  const title = page.headings.h1[0] || page.meta.title;
  const productLinks = page.links.filter((link) => link.internal && link.href.includes("/products/"));

  if (page.wordCount < 250) {
    issues.push(issue(
      page,
      "medium",
      "content",
      "product_description_too_short",
      "Product page may not have enough unique buying content.",
      "Add product benefits, fabric/material, fit, sizing, care, use cases, FAQs, and delivery/returns details.",
      `wordCount=${page.wordCount}`
    ));
  }

  if (!matchesAny(searchableText, materialSignals)) {
    issues.push(issue(
      page,
      "recommended",
      "content",
      "product_missing_material_info",
      "Product page does not clearly mention material or fabric details.",
      "Add material/fabric details such as cotton blend, polyester, GSM, or construction where accurate.",
      title
    ));
  }

  if (!matchesAny(searchableText, sizeSignals)) {
    issues.push(issue(
      page,
      "recommended",
      "content",
      "product_missing_size_info",
      "Product page does not clearly mention size or fit information.",
      "Add size, fit, available sizes, or a visible size chart link.",
      title
    ));
  }

  if (!matchesAny(searchableText, careSignals)) {
    issues.push(issue(
      page,
      "recommended",
      "content",
      "product_missing_care_info",
      "Product page does not clearly mention care instructions.",
      "Add washing or care guidance to help shoppers and improve product detail quality.",
      title
    ));
  }

  if (!matchesAny(searchableText, reviewSignals) && !page.shopify.detectedApps.some((app) => /judge|loox|yotpo|stamped|okendo|review/i.test(app))) {
    issues.push(issue(
      page,
      "recommended",
      "content",
      "product_missing_review_signals",
      "Product page does not expose obvious review or rating signals.",
      "Show product reviews or ratings in crawlable HTML where available.",
      title
    ));
  }

  if (!matchesAny(searchableText, faqSignals)) {
    issues.push(issue(
      page,
      "recommended",
      "content",
      "product_missing_faq_content",
      "Product page does not expose FAQ content.",
      "Add useful product FAQs for sizing, fabric, delivery, returns, and use cases where relevant.",
      title
    ));
  }

  const availability = getAvailabilitySignals(page, searchableText);
  if (availability.soldOut && !availability.inStock && summarizeIndexability(page).indexable) {
    issues.push(issue(
      page,
      "medium",
      "shopify",
      "product_sold_out_indexable",
      "Product appears sold out or unavailable while still indexable.",
      "If the product is permanently unavailable, redirect or noindex it. If temporary, keep it indexable and add alternatives/restock messaging.",
      availability.evidence || title
    ));
  }

  if (page.images.length < 3) {
    issues.push(issue(
      page,
      "recommended",
      "images",
      "product_low_image_count",
      "Product page has fewer than three crawlable images.",
      "Add multiple product images showing front, back, detail, fit, and color/variant views.",
      `imageCount=${page.images.length}`
    ));
  }

  if (productLinks.length > 5) {
    issues.push(issue(
      page,
      "recommended",
      "shopify",
      "product_variant_title_duplicate_risk",
      "Product page links to many other product URLs and may be part of a duplicate variant/combination cluster.",
      "Review whether these should be variants, bundles, canonicalized alternatives, or clearly differentiated products.",
      `linkedProductUrls=${productLinks.length}`
    ));
  }

  return issues;
}

function buildSearchableText(page: CrawledPage): string {
  return [
    page.meta.title,
    page.meta.description,
    page.headings.h1.join(" "),
    page.headings.h2.join(" "),
    page.headings.h3.join(" "),
    page.textSample,
    page.links.map((link) => link.text).join(" ")
  ].join(" ");
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function getAvailabilitySignals(page: CrawledPage, text: string): { soldOut: boolean; inStock: boolean; evidence: string } {
  const soldOutMatch = text.match(/\b(?:sold out|out of stock|notify me when (?:it'?s )?available)\b/i);
  const inStockMatch = [
    page.meta.ogAvailability,
    text.match(/\b(?:in stock|items? left in stock|available now|hurry,\s*only\s+\d+\s+items?\s+left)\b/i)?.[0] || ""
  ].find((value) => /\bin\s*stock\b|available now|items? left/i.test(value));

  return {
    soldOut: Boolean(soldOutMatch),
    inStock: Boolean(inStockMatch),
    evidence: [soldOutMatch?.[0], inStockMatch ? `inStockSignal=${inStockMatch}` : ""].filter(Boolean).join("; ")
  };
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
    evidence: truncate(evidence)
  };
}
