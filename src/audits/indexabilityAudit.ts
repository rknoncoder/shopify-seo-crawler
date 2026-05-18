import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";
import { parseRobotsDirectives, summarizeIndexability } from "../utils/indexability.js";
import { truncate } from "../utils/textUtils.js";

export function auditIndexability(page: CrawledPage): SeoIssue[] {
  if (page.status >= 400) return [];

  const issues: SeoIssue[] = [];
  const robots = parseRobotsDirectives(page.meta.robots);
  const xRobots = parseRobotsDirectives(page.http?.xRobotsTag ?? "");
  const indexability = summarizeIndexability(page);

  if (xRobots.noindex) {
    issues.push(issue(
      page,
      "high",
      "x_robots_tag_noindex",
      "Page is blocked from indexing by X-Robots-Tag noindex.",
      "Remove the HTTP X-Robots-Tag noindex directive if this page should appear in Google Search.",
      page.http?.xRobotsTag ?? ""
    ));
  }

  if (xRobots.nofollow) {
    issues.push(issue(
      page,
      "low",
      "x_robots_tag_nofollow",
      "Page uses X-Robots-Tag nofollow.",
      "Use nofollow only when you intentionally do not want search engines to follow links on this page.",
      page.http?.xRobotsTag ?? ""
    ));
  }

  if (robots.noindex) {
    issues.push(issue(
      page,
      "high",
      "meta_robots_noindex",
      "Page is blocked from indexing by meta robots noindex.",
      "Remove noindex if this page should appear in Google Search.",
      page.meta.robots
    ));
  }

  if (robots.nofollow) {
    issues.push(issue(
      page,
      "low",
      "meta_robots_nofollow",
      "Page uses meta robots nofollow.",
      "Use nofollow only when you intentionally do not want search engines to follow links on this page.",
      page.meta.robots
    ));
  }

  if (indexability.canonicalTarget && !indexability.canonicalSelfReferencing) {
    issues.push(issue(
      page,
      "medium",
      "canonicalized_url",
      "Page is canonicalized to a different URL and is unlikely to be indexed as itself.",
      "Use a self-referencing canonical for pages that should be indexed, or keep this canonical if the page is a duplicate.",
      `canonical=${indexability.canonicalTarget}`
    ));
  }

  if (page.meta.canonical && !indexability.canonicalTarget) {
    issues.push(issue(
      page,
      "medium",
      "invalid_canonical_url",
      "Canonical URL is invalid.",
      "Fix the canonical href so search engines can understand the preferred URL.",
      page.meta.canonical
    ));
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
    url: page.finalUrl,
    pageType: page.pageType,
    severity,
    category: "indexability",
    code,
    message,
    recommendation,
    evidence: truncate(evidence)
  };
}
