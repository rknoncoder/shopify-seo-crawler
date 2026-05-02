import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function auditCollection(page: CrawledPage): SeoIssue[] {
  if (page.pageType !== "collection") return [];

  const issues: SeoIssue[] = [];

  if (page.wordCount < 100) {
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "medium",
      category: "content",
      code: "thin_collection_content",
      message: "Collection page has very little crawlable copy.",
      recommendation: "Add unique intro copy, buying guidance, FAQs, and internal links."
    });
  }

  if (!page.links.some((link) => link.href.includes("/products/"))) {
    issues.push({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "low",
      category: "internal_links",
      code: "collection_no_product_links",
      message: "Collection page has no crawlable product links.",
      recommendation: "Ensure product cards render anchor links in server HTML."
    });
  }

  return issues;
}
