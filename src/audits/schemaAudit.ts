import { expectedSchemaTypesForPage } from "../analyzer/schemaExpectation.js";
import { evaluateSchemaQuality } from "../analyzer/schemaQuality.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function auditSchema(page: CrawledPage): SeoIssue[] {
  const issues: SeoIssue[] = [];
  const qualityIssues = evaluateSchemaQuality(page);
  issues.push(...qualityIssues);

  if (page.status !== 200) return issues;

  const expectedTypes = expectedSchemaTypesForPage(page.pageType);
  if (expectedTypes.length === 0) return issues;

  const schemaTypes = page.schemas.flatMap((schema) => schema.type.split(",").map((type) => type.trim()));
  const hasExpected = expectedTypes.some((type) => schemaTypes.includes(type));

  if (!hasExpected) {
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: page.pageType === "product" ? "high" : "medium",
      category: "schema",
      code: "missing_expected_schema",
      message: `Missing expected schema type: ${expectedTypes.join(" or ")}`,
      recommendation: "Add JSON-LD schema that matches the Shopify template.",
      evidence: schemaTypes.join(", ") || "No schema found"
    });
  }

  return issues;
}
