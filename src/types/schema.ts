export type SchemaSourceType = "shopify_theme" | "shopify_app" | "custom_manual" | "unknown";

export interface SchemaSummary {
  rawSizeBytes: number;
  hasOffer: boolean;
  hasVariant: boolean;
  hasImage: boolean;
  hasBrand: boolean;
  hasName: boolean;
  hasDescription: boolean;
  hasPrice: boolean;
  hasPriceCurrency: boolean;
  hasAvailability: boolean;
  hasUrl: boolean;
  names: string[];
  urls: string[];
}

export interface StructuredDataItem {
  type: string;
  raw?: unknown;
  summary: SchemaSummary;
  validJson: boolean;
  errors: string[];
  sourceType: SchemaSourceType;
  sourceName: string;
  sourceConfidence: "high" | "medium" | "low";
  sourceEvidence: string;
}

export interface SchemaExpectation {
  pageType: string;
  expectedTypes: string[];
}
