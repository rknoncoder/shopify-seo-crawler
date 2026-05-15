import type { CrawledPage } from "../types/page.js";

type RedirectStatus = "no_redirect" | "single_redirect" | "redirect_chain";

export interface RedirectReportRow {
  url: string;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  pageType: string;
  redirected: boolean;
  redirectCount: number;
  redirectStatus: RedirectStatus;
  canonical: string;
  issueCodes: string;
  recommendation: string;
}

export function buildRedirectReport(pages: CrawledPage[]): RedirectReportRow[] {
  return pages.map((page) => ({
    url: page.finalUrl,
    requestedUrl: page.url,
    finalUrl: page.finalUrl,
    status: page.status,
    pageType: page.pageType,
    redirected: page.redirected,
    redirectCount: page.redirectCount,
    redirectStatus: redirectStatus(page),
    canonical: page.meta.canonical,
    issueCodes: page.issues.join("|"),
    recommendation: recommendation(page)
  }));
}

function redirectStatus(page: CrawledPage): RedirectStatus {
  if (!page.redirected) return "no_redirect";
  return page.redirectCount > 1 ? "redirect_chain" : "single_redirect";
}

function recommendation(page: CrawledPage): string {
  if (!page.redirected) return "";
  return "Update sitemap and internal links to point directly to the final URL.";
}
