import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { summarizeIndexability } from "../utils/indexability.js";

export function detectSitemapIndexabilityIssues(pages: CrawledPage[], sitemapUrls: string[]): SeoIssue[] {
  const sitemapSet = new Set(sitemapUrls.map(normalizeForCompare));
  const issues: SeoIssue[] = [];

  for (const page of pages) {
    const inSitemap = sitemapSet.has(normalizeForCompare(page.finalUrl));
    const indexability = summarizeIndexability(page);

    if (inSitemap && page.status >= 400) {
      issues.push(issue(
        page,
        "critical",
        "sitemap_url_http_error",
        `Sitemap URL returned HTTP ${page.status}.`,
        "Remove broken URLs from the sitemap or fix the page response.",
        `status=${page.status}`
      ));
    }

    if (inSitemap && !indexability.indexable) {
      issues.push(issue(
        page,
        "high",
        "sitemap_url_not_indexable",
        "Sitemap URL is not indexable.",
        "Only include indexable canonical URLs in XML sitemaps.",
        `indexabilityStatus=${indexability.status}; canonical=${indexability.canonicalTarget || ""}; robots=${page.meta.robots}`
      ));
    }

    if (inSitemap && indexability.canonicalTarget && !indexability.canonicalSelfReferencing) {
      issues.push(issue(
        page,
        "high",
        "sitemap_url_canonicalized",
        "Sitemap URL canonicalizes to a different URL.",
        "Update the sitemap to include the canonical URL, or make this page self-canonical if it should be indexed.",
        `canonical=${indexability.canonicalTarget}`
      ));
    }

    if (indexability.indexable && !inSitemap && shouldBeInSitemap(page)) {
      issues.push(issue(
        page,
        "medium",
        "indexable_page_missing_from_sitemap",
        "Indexable page was crawled but was not found in the selected sitemap URL set.",
        "Add important indexable pages to the XML sitemap, or confirm this page should only be discovered through links.",
        `indexabilityStatus=${indexability.status}`
      ));
    }

    if (
      indexability.indexable &&
      indexability.canonicalTarget &&
      !sitemapSet.has(normalizeForCompare(indexability.canonicalTarget)) &&
      shouldBeInSitemap(page)
    ) {
      issues.push(issue(
        page,
        "recommended",
        "canonical_url_missing_from_sitemap",
        "Canonical URL is not present in the selected sitemap URL set.",
        "Include canonical product, collection, page, and article URLs in the XML sitemap.",
        `canonical=${indexability.canonicalTarget}`
      ));
    }
  }

  return dedupeIssues(issues);
}

function shouldBeInSitemap(page: CrawledPage): boolean {
  return ["home", "product", "collection", "page", "policy", "blog", "article"].includes(page.pageType);
}

function normalizeForCompare(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
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
    category: "indexability",
    code,
    message,
    recommendation,
    evidence
  };
}

function dedupeIssues(issues: SeoIssue[]): SeoIssue[] {
  const seen = new Set<string>();
  return issues.filter((item) => {
    const key = `${item.url}:${item.code}:${item.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
