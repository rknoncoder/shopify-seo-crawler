import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function evaluateSchemaQuality(page: CrawledPage): SeoIssue[] {
  return page.schemas
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
}
