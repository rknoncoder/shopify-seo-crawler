import type { AnyNode } from "domhandler";
import type { CheerioAPI } from "cheerio";
import type { SchemaSourceType, SchemaSummary, StructuredDataItem } from "../types/schema.js";

const maxStoredRawSchemaBytes = 50000;

export function extractSchemas($: CheerioAPI): StructuredDataItem[] {
  return $('script[type="application/ld+json"]')
    .map((_, element) => {
      const rawText = $(element).contents().text().trim();
      const source = detectSchemaSource($, element, rawText);
      try {
        const parsed = JSON.parse(rawText);
        return normalizeSchemaItem(parsed, source);
      } catch (error) {
        return {
          type: "InvalidJson",
          raw: rawText.slice(0, maxStoredRawSchemaBytes),
          summary: buildSchemaSummary(rawText, rawText),
          validJson: false,
          errors: [error instanceof Error ? error.message : "Invalid JSON-LD"],
          ...source
        };
      }
    })
    .get();
}

function normalizeSchemaItem(raw: unknown, source: SchemaSource): StructuredDataItem {
  const type = getSchemaType(raw);
  const rawText = JSON.stringify(raw);
  const shouldStoreRaw = rawText.length <= maxStoredRawSchemaBytes && !type.split(",").includes("ProductGroup");
  return {
    type,
    raw: shouldStoreRaw ? raw : undefined,
    summary: buildSchemaSummary(raw, rawText),
    validJson: true,
    errors: [],
    ...source
  };
}

function buildSchemaSummary(raw: unknown, rawText: string): SchemaSummary {
  const nodes = flattenUnknownNodes(raw);
  const values = nodes.flatMap((node) => Object.entries(node));
  const names = getStringValues(values, ["name", "headline"]).slice(0, 20);
  const urls = getStringValues(values, ["url", "@id", "item"]).filter((value) => /^https?:|^\//.test(value)).slice(0, 50);

  return {
    rawSizeBytes: Buffer.byteLength(rawText, "utf8"),
    hasOffer: hasTypeInRaw(rawText, "Offer"),
    hasVariant: /"hasVariant"\s*:/.test(rawText),
    hasImage: values.some(([key, value]) => key === "image" && hasAnyValue(value)),
    hasBrand: values.some(([key, value]) => key === "brand" && hasAnyValue(value)),
    hasName: values.some(([key, value]) => (key === "name" || key === "headline") && hasAnyValue(value)),
    hasDescription: values.some(([key, value]) => key === "description" && hasAnyValue(value)),
    hasPrice: values.some(([key, value]) => key === "price" && hasAnyValue(value)),
    hasPriceCurrency: values.some(([key, value]) => key === "priceCurrency" && hasAnyValue(value)),
    hasAvailability: values.some(([key, value]) => key === "availability" && hasAnyValue(value)),
    hasUrl: values.some(([key, value]) => (key === "url" || key === "@id") && hasAnyValue(value)),
    names,
    urls
  };
}

function flattenUnknownNodes(raw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(raw)) return raw.flatMap(flattenUnknownNodes);
  if (!raw || typeof raw !== "object") return [];

  const node = raw as Record<string, unknown>;
  const children = Object.values(node).flatMap((value) => flattenUnknownNodes(value));
  return [node, ...children];
}

function getStringValues(entries: Array<[string, unknown]>, keys: string[]): string[] {
  return entries
    .filter(([key]) => keys.includes(key))
    .flatMap(([, value]) => {
      if (typeof value === "string") return [value.trim()];
      if (typeof value === "number") return [String(value)];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>;
        return getStringValues(Object.entries(nested), keys);
      }
      return [];
    })
    .filter(Boolean);
}

function hasTypeInRaw(rawText: string, type: string): boolean {
  return new RegExp(`"@type"\\s*:\\s*"${type}"`).test(rawText);
}

function hasAnyValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function getSchemaType(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(getSchemaType).join(",");
  if (raw && typeof raw === "object") {
    const value = (raw as Record<string, unknown>)["@type"];
    if (Array.isArray(value)) return value.join(",");
    if (typeof value === "string") return value;
    const graph = (raw as Record<string, unknown>)["@graph"];
    if (Array.isArray(graph)) return graph.map(getSchemaType).join(",");
  }
  return "Unknown";
}

interface SchemaSource {
  sourceType: SchemaSourceType;
  sourceName: string;
  sourceConfidence: "high" | "medium" | "low";
  sourceEvidence: string;
}

function detectSchemaSource($: CheerioAPI, element: AnyNode, rawText: string): SchemaSource {
  const script = $(element);
  const markerText = [
    script.attr("id") || "",
    script.attr("class") || "",
    script.prev().text().slice(-300),
    script.next().text().slice(0, 300),
    rawText.slice(0, 1000)
  ].join(" ").toLowerCase();

  const appSource = detectAppSource(markerText);
  if (appSource) return appSource;

  if (isLikelyShopifyThemeSchema(rawText, markerText)) {
    return {
      sourceType: "shopify_theme",
      sourceName: "Shopify theme structured data",
      sourceConfidence: "medium",
      sourceEvidence: getShopifyThemeEvidence(rawText, markerText)
    };
  }

  if (/manual|custom|schema markup|json-ld|structured data/.test(markerText)) {
    return {
      sourceType: "custom_manual",
      sourceName: "Custom/manual JSON-LD",
      sourceConfidence: "medium",
      sourceEvidence: "Nearby script marker suggests custom/manual structured data"
    };
  }

  return {
    sourceType: "unknown",
    sourceName: "Unknown JSON-LD source",
    sourceConfidence: "low",
    sourceEvidence: "No reliable source marker found in rendered HTML"
  };
}

function getShopifyThemeEvidence(rawText: string, markerText: string): string {
  if (/{{\s*[^}]+\s*}}|{%\s*[^%]+%\}/.test(rawText)) {
    return "Unrendered Liquid variable/tag found in JSON-LD";
  }

  if (/cdn\.shopify\.com|cdn\/shop\//.test(rawText) || /cdn\.shopify\.com|cdn\/shop\//.test(markerText)) {
    return "Shopify CDN URL found in JSON-LD or nearby script marker";
  }

  if (/myshopify\.com/.test(rawText) || /myshopify\.com/.test(markerText)) {
    return "myshopify.com domain found in JSON-LD or nearby script marker";
  }

  if (/\/products\/|\/collections\//.test(rawText)) {
    return "Shopify product/collection URL pattern found in JSON-LD";
  }

  return "Shopify-style ProductGroup/variant JSON-LD or theme schema pattern";
}

function detectAppSource(markerText: string): SchemaSource | undefined {
  const appMarkers: Array<{ name: string; pattern: RegExp }> = [
    { name: "Judge.me", pattern: /judge\.me|judgeme/ },
    { name: "Yotpo", pattern: /yotpo/ },
    { name: "Loox", pattern: /loox/ },
    { name: "Stamped.io", pattern: /stamped/ },
    { name: "Okendo", pattern: /okendo/ },
    { name: "Klaviyo", pattern: /klaviyo/ },
    { name: "Shopify Product Reviews", pattern: /productreviews\.shopifycdn|shopify product reviews/ },
    { name: "Schema Plus", pattern: /schema plus|schemaplus/ },
    { name: "Smart SEO", pattern: /smart seo/ },
    { name: "JSON-LD for SEO", pattern: /json-ld for seo|jsonld for seo/ }
  ];

  const matched = appMarkers.find((marker) => marker.pattern.test(markerText));
  if (!matched) return undefined;

  return {
    sourceType: "shopify_app",
    sourceName: matched.name,
    sourceConfidence: "high",
    sourceEvidence: `Detected app marker: ${matched.name}`
  };
}

function isLikelyShopifyThemeSchema(rawText: string, markerText: string): boolean {
  return /"@type"\s*:\s*"ProductGroup"/.test(rawText) ||
    /"hasVariant"\s*:/.test(rawText) ||
    /"productGroupID"\s*:/.test(rawText) ||
    /\/products\/[^"]+\?variant=/.test(rawText) ||
    /cdn\.shopify\.com|cdn\/shop\/|myshopify\.com|shopify\.theme|shopify\.shop/.test(markerText) ||
    /cdn\.shopify\.com|cdn\/shop\/|myshopify\.com|\/products\/|\/collections\//.test(rawText) ||
    /{{\s*[^}]+\s*}}|{%\s*[^%]+%\}/.test(rawText);
}
