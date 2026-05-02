import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function detectCanonicalIssues(pages: CrawledPage[]): SeoIssue[] {
  return pages
    .filter((page) => page.meta.canonical && !isValidCanonical(page.meta.canonical, page.finalUrl))
    .map((page) => ({
      url: page.finalUrl,
      pageType: page.pageType,
      severity: "medium" as const,
      category: "technical" as const,
      code: "canonical_different_origin",
      message: "Canonical URL points to a different origin.",
      recommendation: "Verify cross-domain canonical targets are intentional.",
      evidence: page.meta.canonical
    }));
}

function isValidCanonical(canonical: string, pageUrl: string): boolean {
  try {
    const canonicalUrl = new URL(canonical, pageUrl);
    return canonicalUrl.origin === new URL(pageUrl).origin;
  } catch {
    return false;
  }
}
