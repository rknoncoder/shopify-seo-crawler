import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

type EligibilityStatus = "eligible" | "not_applicable" | "missing_schema" | "has_validation_issues";

export interface RichResultEligibilityRow {
  url: string;
  status: number;
  pageType: string;
  schemaTypes: string;
  productSnippetEligibility: EligibilityStatus;
  merchantListingEligibility: EligibilityStatus;
  breadcrumbEligibility: EligibilityStatus;
  articleEligibility: EligibilityStatus;
  faqEligibility: EligibilityStatus;
  collectionItemListEligibility: EligibilityStatus;
  blockingIssues: string;
  notes: string;
}

const productIssueCodes = new Set([
  "product_schema_missing",
  "product_schema_missing_name",
  "product_schema_missing_description",
  "product_schema_missing_image",
  "product_schema_name_mismatch",
  "product_group_missing_variants",
  "product_schema_url_mismatch",
  "product_schema_missing_brand"
]);

const offerIssueCodes = new Set([
  "product_offer_missing",
  "product_schema_missing_offer",
  "product_schema_incomplete_offer",
  "offer_schema_missing_price",
  "offer_schema_missing_currency",
  "offer_schema_missing_availability",
  "offer_schema_missing_url",
  "offer_schema_invalid_price",
  "offer_schema_invalid_currency"
]);

const articleIssueCodes = new Set([
  "article_schema_missing_headline",
  "article_schema_missing_date_published",
  "article_schema_missing_author",
  "article_schema_missing_image",
  "article_schema_headline_mismatch"
]);

const faqIssueCodes = new Set([
  "faq_schema_empty",
  "faq_schema_incomplete_question"
]);

const breadcrumbIssueCodes = new Set([
  "breadcrumb_schema_too_short",
  "breadcrumb_schema_incomplete_item"
]);

const itemListIssueCodes = new Set([
  "collection_schema_empty_item_list"
]);

export function buildRichResultEligibilityReport(pages: CrawledPage[], issues: SeoIssue[]): RichResultEligibilityRow[] {
  const issuesByUrl = groupIssuesByUrl(issues);

  return pages.map((page) => {
    const pageIssues = issuesByUrl.get(page.finalUrl) || [];
    const schemaTypes = getSchemaTypes(page);
    const blockingIssues = getBlockingIssueCodes(pageIssues);

    return {
      url: page.finalUrl,
      status: page.status,
      pageType: page.pageType,
      schemaTypes: [...new Set(schemaTypes)].join("|"),
      productSnippetEligibility: productSnippetEligibility(page, schemaTypes, pageIssues),
      merchantListingEligibility: merchantListingEligibility(page, schemaTypes, pageIssues),
      breadcrumbEligibility: schemaEligibility(schemaTypes, pageIssues, "BreadcrumbList", breadcrumbIssueCodes, appliesToSearchPage(page)),
      articleEligibility: articleEligibility(page, schemaTypes, pageIssues),
      faqEligibility: schemaEligibility(schemaTypes, pageIssues, "FAQPage", faqIssueCodes, hasSchema(schemaTypes, "FAQPage")),
      collectionItemListEligibility: schemaEligibility(schemaTypes, pageIssues, "ItemList", itemListIssueCodes, page.pageType === "collection"),
      blockingIssues: blockingIssues.join("|"),
      notes: notesForPage(page, schemaTypes)
    };
  });
}

function productSnippetEligibility(page: CrawledPage, schemaTypes: string[], issues: SeoIssue[]): EligibilityStatus {
  if (page.pageType !== "product") return "not_applicable";
  if (!hasAnySchema(schemaTypes, ["Product", "ProductGroup"])) return "missing_schema";
  if (hasAnyIssue(issues, productIssueCodes) || hasAnyIssue(issues, offerIssueCodes)) return "has_validation_issues";
  return "eligible";
}

function merchantListingEligibility(page: CrawledPage, schemaTypes: string[], issues: SeoIssue[]): EligibilityStatus {
  if (page.pageType !== "product") return "not_applicable";
  if (!hasAnySchema(schemaTypes, ["Product", "ProductGroup"]) || !page.schemas.some((schema) => schema.summary.hasOffer)) return "missing_schema";
  if (hasAnyIssue(issues, productIssueCodes) || hasAnyIssue(issues, offerIssueCodes)) return "has_validation_issues";
  return "eligible";
}

function articleEligibility(page: CrawledPage, schemaTypes: string[], issues: SeoIssue[]): EligibilityStatus {
  if (page.pageType !== "article") return "not_applicable";
  if (!hasAnySchema(schemaTypes, ["Article", "BlogPosting"])) return "missing_schema";
  if (hasAnyIssue(issues, articleIssueCodes)) return "has_validation_issues";
  return "eligible";
}

function schemaEligibility(
  schemaTypes: string[],
  issues: SeoIssue[],
  schemaType: string,
  validationIssueCodes: Set<string>,
  applicable: boolean
): EligibilityStatus {
  if (!applicable) return "not_applicable";
  if (!hasSchema(schemaTypes, schemaType)) return "missing_schema";
  if (hasAnyIssue(issues, validationIssueCodes)) return "has_validation_issues";
  return "eligible";
}

function appliesToSearchPage(page: CrawledPage): boolean {
  return ["home", "product", "collection", "page", "article", "blog"].includes(page.pageType);
}

function notesForPage(page: CrawledPage, schemaTypes: string[]): string {
  const notes: string[] = [];

  if (page.pageType === "product" && hasSchema(schemaTypes, "ProductGroup")) {
    notes.push("ProductGroup detected; good for variant products if variants/offers are valid.");
  }

  if (page.pageType === "collection" && hasSchema(schemaTypes, "CollectionPage") && !hasSchema(schemaTypes, "ItemList")) {
    notes.push("CollectionPage exists, but ItemList is missing.");
  }

  if (!hasSchema(schemaTypes, "BreadcrumbList")) {
    notes.push("BreadcrumbList not detected.");
  }

  return notes.join(" ");
}

function getBlockingIssueCodes(issues: SeoIssue[]): string[] {
  return issues
    .filter((issue) => issue.category === "schema" && ["critical", "high", "medium"].includes(issue.severity))
    .map((issue) => issue.code);
}

function getSchemaTypes(page: CrawledPage): string[] {
  return page.schemas.flatMap((schema) => schema.type.split(",").map((type) => type.trim()).filter(Boolean));
}

function hasSchema(schemaTypes: string[], schemaType: string): boolean {
  return schemaTypes.includes(schemaType);
}

function hasAnySchema(schemaTypes: string[], expectedTypes: string[]): boolean {
  return expectedTypes.some((type) => schemaTypes.includes(type));
}

function hasAnyIssue(issues: SeoIssue[], codes: Set<string>): boolean {
  return issues.some((issue) => codes.has(issue.code));
}

function groupIssuesByUrl(issues: SeoIssue[]): Map<string, SeoIssue[]> {
  const groups = new Map<string, SeoIssue[]>();
  for (const issue of issues) {
    groups.set(issue.url, [...(groups.get(issue.url) || []), issue]);
  }
  return groups;
}
