import type { CheerioAPI } from "cheerio";
import type { StructuredDataItem } from "../types/schema.js";

export function extractSchemas($: CheerioAPI): StructuredDataItem[] {
  return $('script[type="application/ld+json"]')
    .map((_, element) => {
      const rawText = $(element).contents().text().trim();
      try {
        const parsed = JSON.parse(rawText);
        return normalizeSchemaItem(parsed);
      } catch (error) {
        return {
          type: "InvalidJson",
          raw: rawText,
          validJson: false,
          errors: [error instanceof Error ? error.message : "Invalid JSON-LD"]
        };
      }
    })
    .get();
}

function normalizeSchemaItem(raw: unknown): StructuredDataItem {
  const type = getSchemaType(raw);
  return {
    type,
    raw,
    validJson: true,
    errors: []
  };
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
