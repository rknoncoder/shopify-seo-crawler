import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

export function detectRedirectIssues(pages: CrawledPage[]): SeoIssue[] {
  return [
    ...detectCrawledUrlRedirects(pages),
    ...detectInternalLinksToRedirectedUrls(pages)
  ];
}

function detectCrawledUrlRedirects(pages: CrawledPage[]): SeoIssue[] {
  return pages
    .filter((page) => page.redirected)
    .map((page) => issue(
      page,
      page.redirectCount > 1 ? "medium" : "recommended",
      page.redirectCount > 1 ? "redirect_chain" : "url_redirects",
      page.redirectCount > 1 ? "Crawled URL redirects through more than one hop." : "Crawled URL redirects to a different final URL.",
      "Update sitemap and internal links to point directly to the final canonical URL.",
      `requested=${page.url}; final=${page.finalUrl}; redirectCount=${page.redirectCount}`
    ));
}

function detectInternalLinksToRedirectedUrls(pages: CrawledPage[]): SeoIssue[] {
  const redirectTargets = new Map<string, CrawledPage>();

  for (const page of pages) {
    if (page.redirected) {
      redirectTargets.set(normalizeForCompare(page.url), page);
    }
  }

  if (redirectTargets.size === 0) return [];

  const issues: SeoIssue[] = [];
  const seen = new Set<string>();

  for (const sourcePage of pages) {
    for (const link of sourcePage.links) {
      if (!link.internal) continue;

      const redirectedTarget = redirectTargets.get(normalizeForCompare(link.href));
      if (!redirectedTarget) continue;

      const key = `${sourcePage.finalUrl}:${link.href}`;
      if (seen.has(key)) continue;
      seen.add(key);

      issues.push({
        url: sourcePage.finalUrl,
        pageType: sourcePage.pageType,
        severity: "recommended",
        category: "redirects",
        code: "internal_link_to_redirect",
        message: "Internal link points to a URL that redirects.",
        recommendation: "Update the internal link href to the final URL to reduce crawl waste and latency.",
        evidence: truncate(`link=${link.href}; final=${redirectedTarget.finalUrl}; anchor=${link.text}`, 260)
      });
    }
  }

  return issues;
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
    url: page.url,
    pageType: page.pageType,
    severity,
    category: "redirects",
    code,
    message,
    recommendation,
    evidence: truncate(evidence, 260)
  };
}

function normalizeForCompare(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") && parsed.pathname !== "/" ? normalized.slice(0, -1) : normalized;
  } catch {
    return url;
  }
}
