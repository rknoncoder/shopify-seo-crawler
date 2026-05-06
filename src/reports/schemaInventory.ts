import type { CrawledPage } from "../types/page.js";

export interface SchemaInventoryRow {
  url: string;
  status: number;
  pageType: string;
  schemaCount: number;
  validSchemaCount: number;
  invalidSchemaCount: number;
  schemaTypes: string;
  schemaSources: string;
  schemaSourceNames: string;
  schemaSourceConfidence: string;
  hasProduct: boolean;
  hasProductGroup: boolean;
  hasOffer: boolean;
  hasFAQPage: boolean;
  hasCollectionPage: boolean;
  hasItemList: boolean;
  hasArticle: boolean;
  hasBlogPosting: boolean;
  hasBreadcrumbList: boolean;
  hasOrganization: boolean;
  hasWebSite: boolean;
}

export interface SchemaSummaryRow {
  schemaType: string;
  pageType: string;
  sourceType: string;
  sourceName: string;
  urls: number;
  schemaNodes: number;
}

export function buildSchemaInventory(pages: CrawledPage[]): SchemaInventoryRow[] {
  return pages.map((page) => {
    const schemaTypes = getSchemaTypes(page);
    const rawSchema = JSON.stringify(page.schemas.map((schema) => schema.raw || schema.summary || {}));
    const schemaSources = page.schemas.map((schema) => getSchemaSource(schema, rawSchema));

    return {
      url: page.finalUrl,
      status: page.status,
      pageType: page.pageType,
      schemaCount: page.schemas.length,
      validSchemaCount: page.schemas.filter((schema) => schema.validJson).length,
      invalidSchemaCount: page.schemas.filter((schema) => !schema.validJson).length,
      schemaTypes: [...new Set(schemaTypes)].join("|"),
      schemaSources: [...new Set(schemaSources.map((source) => source.sourceType))].join("|"),
      schemaSourceNames: [...new Set(schemaSources.map((source) => source.sourceName))].join("|"),
      schemaSourceConfidence: [...new Set(schemaSources.map((source) => source.sourceConfidence))].join("|"),
      hasProduct: schemaTypes.includes("Product"),
      hasProductGroup: schemaTypes.includes("ProductGroup"),
      hasOffer: schemaTypes.includes("Offer") || page.schemas.some((schema) => schema.summary?.hasOffer) || rawSchema.includes('"@type":"Offer"') || rawSchema.includes('"@type": "Offer"'),
      hasFAQPage: schemaTypes.includes("FAQPage"),
      hasCollectionPage: schemaTypes.includes("CollectionPage"),
      hasItemList: schemaTypes.includes("ItemList"),
      hasArticle: schemaTypes.includes("Article"),
      hasBlogPosting: schemaTypes.includes("BlogPosting"),
      hasBreadcrumbList: schemaTypes.includes("BreadcrumbList"),
      hasOrganization: schemaTypes.includes("Organization"),
      hasWebSite: schemaTypes.includes("WebSite")
    };
  });
}

export function buildSchemaSummary(pages: CrawledPage[]): SchemaSummaryRow[] {
  const groups = new Map<string, { urls: Set<string>; schemaNodes: number }>();

  for (const page of pages) {
    for (const schemaType of getSchemaTypes(page)) {
      const schema = page.schemas.find((item) => item.type.split(",").map((type) => type.trim()).includes(schemaType));
      const source = schema ? getSchemaSource(schema, JSON.stringify(schema.raw)) : undefined;
      const sourceType = source?.sourceType || "unknown";
      const sourceName = source?.sourceName || "Unknown JSON-LD source";
      const key = `${schemaType}::${page.pageType}::${sourceType}::${sourceName}`;
      const group = groups.get(key) || { urls: new Set<string>(), schemaNodes: 0 };
      group.urls.add(page.finalUrl);
      group.schemaNodes += 1;
      groups.set(key, group);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const [schemaType, pageType, sourceType, sourceName] = key.split("::");
      return {
        schemaType,
        pageType,
        sourceType,
        sourceName,
        urls: group.urls.size,
        schemaNodes: group.schemaNodes
      };
    })
    .sort((a, b) => b.urls - a.urls || a.schemaType.localeCompare(b.schemaType));
}

function getSchemaTypes(page: CrawledPage): string[] {
  return page.schemas.flatMap((schema) => schema.type.split(",").map((type) => type.trim()).filter(Boolean));
}

function getSchemaSource(
  schema: CrawledPage["schemas"][number],
  rawSchema: string
): { sourceType: string; sourceName: string; sourceConfidence: string } {
  if (schema.sourceType && schema.sourceName && schema.sourceConfidence) {
    return {
      sourceType: schema.sourceType,
      sourceName: schema.sourceName,
      sourceConfidence: schema.sourceConfidence
    };
  }

  if (/ProductGroup|hasVariant|productGroupID|\/products\/[^"]+\?variant=/.test(rawSchema) || schema.summary?.hasVariant) {
    return {
      sourceType: "shopify_theme",
      sourceName: "Shopify theme structured data",
      sourceConfidence: "medium"
    };
  }

  if (/cdn\.shopify\.com|cdn\/shop\/|myshopify\.com|\/products\/|\/collections\/|{{\s*[^}]+\s*}}|{%\s*[^%]+%\}/.test(rawSchema)) {
    return {
      sourceType: "shopify_theme",
      sourceName: "Shopify theme structured data",
      sourceConfidence: "medium"
    };
  }

  if (/judge\.me|judgeme|yotpo|loox|stamped|okendo/i.test(rawSchema)) {
    return {
      sourceType: "shopify_app",
      sourceName: "Shopify app structured data",
      sourceConfidence: "medium"
    };
  }

  return {
    sourceType: "unknown",
    sourceName: "Unknown JSON-LD source",
    sourceConfidence: "low"
  };
}
