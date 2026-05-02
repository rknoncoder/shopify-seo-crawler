import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { isFacetedUrl, stripFacets } from "../utils/facetedUrl.js";

export function auditFacetedNavigation(page: CrawledPage): SeoIssue[] {
  const facetedLinks = page.links.filter((link) => isFacetedUrl(link.href));
  if (facetedLinks.length === 0) return [];

  return [{
    url: page.finalUrl,
    pageType: page.pageType,
    severity: "medium",
    category: "faceted_navigation",
    code: "crawlable_faceted_urls",
    message: `${facetedLinks.length} crawlable faceted/filter URLs found.`,
    recommendation: "Keep filtered collection states canonicalized to the clean collection URL and avoid linking excessive parameter combinations.",
    evidence: facetedLinks.slice(0, 3).map((link) => `${link.href} -> ${stripFacets(link.href)}`).join(" | ")
  }];
}
