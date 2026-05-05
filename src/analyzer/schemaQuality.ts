import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function evaluateSchemaQuality(page: CrawledPage): SeoIssue[] {
  const issues: SeoIssue[] = page.schemas
    .filter((schema) => !schema.validJson || schema.errors.length > 0)
    .map((schema) => ({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "high" as const,
      category: "schema" as const,
      code: "invalid_json_ld",
      message: "Invalid JSON-LD schema found.",
      recommendation: "Validate and fix JSON-LD syntax.",
      evidence: schema.errors.join("; ")
    }));

  if (page.status !== 200) {
    return issues;
  }

  const nodes = getSchemaNodes(page);
  issues.push(...validateDuplicateSchemaNodes(page, nodes));
  issues.push(...validatePageSchema(page, nodes));
  issues.push(...validateProductSchema(page, nodes));
  issues.push(...validateArticleSchema(page, nodes));
  issues.push(...validateCollectionSchema(page, nodes));
  issues.push(...validateFaqSchema(page, nodes));
  issues.push(...validateBreadcrumbSchema(page, nodes));
  issues.push(...validateHomeSchema(page, nodes));

  return issues;
}

type SchemaNode = Record<string, unknown>;

function getSchemaNodes(page: CrawledPage): SchemaNode[] {
  return page.schemas
    .filter((schema) => schema.validJson)
    .flatMap((schema) => flattenSchemaNodes(schema.raw));
}

function flattenSchemaNodes(raw: unknown): SchemaNode[] {
  if (Array.isArray(raw)) {
    return raw.flatMap(flattenSchemaNodes);
  }

  if (!isObject(raw)) {
    return [];
  }

  const graph = raw["@graph"];
  if (Array.isArray(graph)) {
    return [raw, ...graph.flatMap(flattenSchemaNodes)];
  }

  return [raw];
}

function validateDuplicateSchemaNodes(page: CrawledPage, nodes: SchemaNode[]): SeoIssue[] {
  const ids = nodes
    .map((node) => getString(node["@id"]))
    .filter((id): id is string => Boolean(id));
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

  if (duplicateIds.length === 0) return [];

  return [issue(
    page,
    "low",
    "duplicate_schema_id",
    "Duplicate schema @id values found.",
    "Make each JSON-LD node @id unique or merge duplicate nodes.",
    [...new Set(duplicateIds)].join(", ")
  )];
}

function validatePageSchema(page: CrawledPage, nodes: SchemaNode[]): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const pageNodes = nodes.filter((node) => hasType(node, ["WebPage", "CollectionPage", "Article", "BlogPosting"]));

  for (const node of pageNodes) {
    const schemaUrl = getSchemaUrl(node);
    if (schemaUrl && page.meta.canonical && !sameNormalizedUrl(schemaUrl, page.meta.canonical, page.finalUrl)) {
      issues.push(issue(
        page,
        "medium",
        "schema_url_mismatch",
        "Schema URL does not match the canonical URL.",
        "Set schema url/mainEntityOfPage to the page canonical URL.",
        `schemaUrl=${schemaUrl}; canonical=${page.meta.canonical}`
      ));
    }

    const name = getFirstString(node, ["headline", "name"]);
    if (name && page.headings.h1[0] && !textMatches(name, page.headings.h1[0])) {
      issues.push(issue(
        page,
        "low",
        "schema_name_h1_mismatch",
        "Schema name/headline does not match the page H1.",
        "Align schema name/headline with the visible primary heading.",
        `schema=${name}; h1=${page.headings.h1[0]}`
      ));
    }
  }

  return dedupeIssues(issues);
}

function validateProductSchema(page: CrawledPage, nodes: SchemaNode[]): SeoIssue[] {
  if (page.pageType !== "product") return [];

  const product = nodes.find((node) => hasType(node, ["Product", "ProductGroup"]));
  if (!product) return [];

  const issues: SeoIssue[] = [];
  requireField(page, issues, product, "name", "product_schema_missing_name", "Product schema is missing name.", "Add the product name to Product/ProductGroup schema.");
  requireField(page, issues, product, "description", "product_schema_missing_description", "Product schema is missing description.", "Add a product description to Product/ProductGroup schema.");
  requireField(page, issues, product, "brand", "product_schema_missing_brand", "Product schema is missing brand.", "Add brand.name to Product/ProductGroup schema.");

  if (!hasProductImage(product)) {
    issues.push(issue(
      page,
      "medium",
      "product_schema_missing_image",
      "Product schema is missing image.",
      "Add at least one product image URL to Product/ProductGroup schema or variant Product nodes."
    ));
  }

  const schemaUrl = getSchemaUrl(product);
  if (schemaUrl && page.meta.canonical && !sameNormalizedUrl(schemaUrl, page.meta.canonical, page.finalUrl)) {
    issues.push(issue(
      page,
      "medium",
      "product_schema_url_mismatch",
      "Product schema URL does not match the canonical URL.",
      "Set Product/ProductGroup url to the canonical product URL.",
      `schemaUrl=${schemaUrl}; canonical=${page.meta.canonical}`
    ));
  }

  const schemaName = getString(product.name);
  if (schemaName && page.headings.h1[0] && !textMatches(schemaName, page.headings.h1[0])) {
    issues.push(issue(
      page,
      "medium",
      "product_schema_name_mismatch",
      "Product schema name does not match the product H1.",
      "Keep Product/ProductGroup name aligned with the visible product name.",
      `schema=${schemaName}; h1=${page.headings.h1[0]}`
    ));
  }

  const offers = getProductOffers(product);
  if (offers.length === 0) {
    issues.push(issue(
      page,
      "medium",
      "product_schema_missing_offer",
      "Product schema has no Offer data.",
      "Add offers with price, priceCurrency, availability, and url."
    ));
  }

  for (const offer of offers) {
    validateOffer(page, issues, offer);
  }

  if (hasType(product, ["ProductGroup"])) {
    const variants = Array.isArray(product.hasVariant) ? product.hasVariant : [];
    if (variants.length === 0) {
      issues.push(issue(
        page,
        "medium",
        "product_group_missing_variants",
        "ProductGroup schema has no hasVariant items.",
        "Add variant Product nodes under hasVariant for Shopify variant products."
      ));
    }
  }

  return dedupeIssues(issues);
}

function validateArticleSchema(page: CrawledPage, nodes: SchemaNode[]): SeoIssue[] {
  if (page.pageType !== "article") return [];

  const article = nodes.find((node) => hasType(node, ["Article", "BlogPosting"]));
  if (!article) return [];

  const issues: SeoIssue[] = [];
  requireField(page, issues, article, "headline", "article_schema_missing_headline", "Article schema is missing headline.", "Add headline to Article/BlogPosting schema.");
  requireField(page, issues, article, "datePublished", "article_schema_missing_date_published", "Article schema is missing datePublished.", "Add datePublished to Article/BlogPosting schema.");
  requireField(page, issues, article, "author", "article_schema_missing_author", "Article schema is missing author.", "Add author name to Article/BlogPosting schema.");
  requireField(page, issues, article, "image", "article_schema_missing_image", "Article schema is missing image.", "Add a representative article image.");

  const headline = getString(article.headline);
  if (headline && page.headings.h1[0] && !textMatches(headline, page.headings.h1[0])) {
    issues.push(issue(
      page,
      "medium",
      "article_schema_headline_mismatch",
      "Article schema headline does not match the H1.",
      "Align Article/BlogPosting headline with the visible article title.",
      `headline=${headline}; h1=${page.headings.h1[0]}`
    ));
  }

  return dedupeIssues(issues);
}

function validateCollectionSchema(page: CrawledPage, nodes: SchemaNode[]): SeoIssue[] {
  if (page.pageType !== "collection") return [];

  const itemList = nodes.find((node) => hasType(node, ["ItemList"]));
  if (!itemList) return [];

  const items = Array.isArray(itemList.itemListElement) ? itemList.itemListElement : [];
  if (items.length === 0) {
    return [issue(
      page,
      "medium",
      "collection_schema_empty_item_list",
      "Collection ItemList schema has no itemListElement entries.",
      "Add visible collection products to ItemList schema."
    )];
  }

  return [];
}

function validateFaqSchema(page: CrawledPage, nodes: SchemaNode[]): SeoIssue[] {
  const faq = nodes.find((node) => hasType(node, ["FAQPage"]));
  if (!faq) return [];

  const questions = Array.isArray(faq.mainEntity) ? faq.mainEntity : [];
  const issues: SeoIssue[] = [];

  if (questions.length === 0) {
    issues.push(issue(page, "medium", "faq_schema_empty", "FAQPage schema has no questions.", "Add mainEntity Question items or remove FAQPage schema."));
  }

  questions.forEach((question, index) => {
    if (!isObject(question)) return;
    const name = getString(question.name);
    const answer = isObject(question.acceptedAnswer) ? getString(question.acceptedAnswer.text) : "";
    if (!name || !answer) {
      issues.push(issue(
        page,
        "medium",
        "faq_schema_incomplete_question",
        "FAQPage schema has an incomplete question/answer.",
        "Each FAQ question needs name and acceptedAnswer.text.",
        `questionIndex=${index + 1}`
      ));
    }
  });

  return dedupeIssues(issues);
}

function validateBreadcrumbSchema(page: CrawledPage, nodes: SchemaNode[]): SeoIssue[] {
  const breadcrumb = nodes.find((node) => hasType(node, ["BreadcrumbList"]));
  if (!breadcrumb) return [];

  const items = Array.isArray(breadcrumb.itemListElement) ? breadcrumb.itemListElement : [];
  if (items.length < 2) {
    return [issue(
      page,
      "low",
      "breadcrumb_schema_too_short",
      "BreadcrumbList schema has fewer than two items.",
      "Include at least home and current page in breadcrumb schema."
    )];
  }

  const invalidItems = items.filter((item) => {
    if (!isObject(item)) return true;
    const nestedItem = item.item;
    const name = getString(item.name) || (isObject(nestedItem) ? getString(nestedItem.name) : "");
    const position = typeof item.position === "number" || typeof item.position === "string";
    return !name || !position;
  });

  if (invalidItems.length === 0) return [];

  return [issue(
    page,
    "low",
    "breadcrumb_schema_incomplete_item",
    "BreadcrumbList schema has incomplete items.",
    "Each breadcrumb item needs name and position.",
    `invalidItems=${invalidItems.length}`
  )];
}

function validateHomeSchema(page: CrawledPage, nodes: SchemaNode[]): SeoIssue[] {
  if (page.pageType !== "home") return [];

  const issues: SeoIssue[] = [];
  const organization = nodes.find((node) => hasType(node, ["Organization"]));
  const website = nodes.find((node) => hasType(node, ["WebSite"]));

  if (organization) {
    requireField(page, issues, organization, "name", "organization_schema_missing_name", "Organization schema is missing name.", "Add name to Organization schema.");
    requireField(page, issues, organization, "url", "organization_schema_missing_url", "Organization schema is missing URL.", "Add the site URL to Organization schema.");
    requireField(page, issues, organization, "logo", "organization_schema_missing_logo", "Organization schema is missing logo.", "Add logo to Organization schema.");
  }

  if (website) {
    requireField(page, issues, website, "name", "website_schema_missing_name", "WebSite schema is missing name.", "Add site name to WebSite schema.");
    requireField(page, issues, website, "url", "website_schema_missing_url", "WebSite schema is missing URL.", "Add homepage URL to WebSite schema.");
  }

  return dedupeIssues(issues);
}

function validateOffer(page: CrawledPage, issues: SeoIssue[], offer: SchemaNode): void {
  requireField(page, issues, offer, "price", "offer_schema_missing_price", "Offer schema is missing price.", "Add price to every product offer.");
  requireField(page, issues, offer, "priceCurrency", "offer_schema_missing_currency", "Offer schema is missing priceCurrency.", "Add ISO currency code to every product offer.");
  requireField(page, issues, offer, "availability", "offer_schema_missing_availability", "Offer schema is missing availability.", "Add schema.org availability to every product offer.");
  requireField(page, issues, offer, "url", "offer_schema_missing_url", "Offer schema is missing URL.", "Add offer URL to every product offer.");

  const price = getString(offer.price);
  if (price && !/^\d+(\.\d+)?$/.test(price)) {
    issues.push(issue(page, "medium", "offer_schema_invalid_price", "Offer schema price is not numeric.", "Use a numeric price value without currency symbols.", price));
  }

  const currency = getString(offer.priceCurrency);
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    issues.push(issue(page, "medium", "offer_schema_invalid_currency", "Offer schema priceCurrency is invalid.", "Use a three-letter ISO currency code such as INR or USD.", currency));
  }

  const availability = getString(offer.availability);
  if (availability && !/schema\.org\/(InStock|OutOfStock|PreOrder|BackOrder|SoldOut|LimitedAvailability|Discontinued)/.test(availability)) {
    issues.push(issue(page, "low", "offer_schema_unusual_availability", "Offer schema availability is not a common schema.org value.", "Use a valid schema.org ItemAvailability URL.", availability));
  }
}

function getProductOffers(product: SchemaNode): SchemaNode[] {
  const directOffers = normalizeNodeArray(product.offers);
  const variantOffers = normalizeNodeArray(product.hasVariant)
    .flatMap((variant) => normalizeNodeArray(variant.offers));
  return [...directOffers, ...variantOffers];
}

function hasProductImage(product: SchemaNode): boolean {
  if (hasSchemaValue(product.image)) return true;
  return normalizeNodeArray(product.hasVariant).some((variant) => hasSchemaValue(variant.image));
}

function normalizeNodeArray(value: unknown): SchemaNode[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (isObject(value)) return [value];
  return [];
}

function requireField(
  page: CrawledPage,
  issues: SeoIssue[],
  node: SchemaNode,
  field: string,
  code: string,
  message: string,
  recommendation: string
): void {
  const value = node[field];
  if (!hasSchemaValue(value)) {
    issues.push(issue(page, "medium", code, message, recommendation));
  }
}

function hasSchemaValue(value: unknown): boolean {
  return Array.isArray(value)
    ? value.length > 0
    : isObject(value)
      ? Object.keys(value).length > 0
      : Boolean(getString(value));
}

function hasType(node: SchemaNode, types: string[]): boolean {
  const nodeTypes = normalizeTypes(node["@type"]);
  return types.some((type) => nodeTypes.includes(type));
}

function normalizeTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(normalizeTypes);
  if (typeof value === "string") return [value];
  return [];
}

function getSchemaUrl(node: SchemaNode): string {
  const mainEntity = node.mainEntityOfPage;
  return getFirstString(node, ["url", "@id"]) || (isObject(mainEntity) ? getFirstString(mainEntity, ["@id", "url"]) : "");
}

function getFirstString(node: SchemaNode, fields: string[]): string {
  for (const field of fields) {
    const value = getString(node[field]);
    if (value) return value;
  }
  return "";
}

function sameNormalizedUrl(left: string, right: string, baseUrl: string): boolean {
  try {
    return normalizeUrlForCompare(left, baseUrl) === normalizeUrlForCompare(right, baseUrl);
  } catch {
    return false;
  }
}

function normalizeUrlForCompare(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl);
  parsed.hash = "";
  parsed.search = "";
  const normalized = parsed.toString();
  return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
}

function textMatches(left: string, right: string): boolean {
  const cleanLeft = normalizeText(left);
  const cleanRight = normalizeText(right);
  return cleanLeft === cleanRight || cleanLeft.includes(cleanRight) || cleanRight.includes(cleanLeft);
}

function normalizeText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function isObject(value: unknown): value is SchemaNode {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    category: "schema",
    code,
    message,
    recommendation,
    evidence
  };
}

function dedupeIssues(issues: SeoIssue[]): SeoIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.code}:${item.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
