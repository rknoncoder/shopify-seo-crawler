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

  addRobotsDisplayDirectiveIssues(page, issues, "x_robots_tag", xRobots, page.http?.xRobotsTag ?? "");
  addRobotsDisplayDirectiveIssues(page, issues, "meta_robots", robots, page.meta.robots);

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

function addRobotsDisplayDirectiveIssues(
  page: CrawledPage,
  issues: SeoIssue[],
  source: "meta_robots" | "x_robots_tag",
  directives: ReturnType<typeof parseRobotsDirectives>,
  rawValue: string
): void {
  const sourceLabel = source === "meta_robots" ? "meta robots" : "X-Robots-Tag";

  if (directives.nosnippet) {
    issues.push(issue(
      page,
      "recommended",
      `${source}_nosnippet`,
      `Page uses ${sourceLabel} nosnippet.`,
      "Use nosnippet only when you intentionally want search engines to hide text snippets for this page.",
      rawValue
    ));
  }

  if (directives.noarchive) {
    issues.push(issue(
      page,
      "recommended",
      `${source}_noarchive`,
      `Page uses ${sourceLabel} noarchive.`,
      "Use noarchive only when you intentionally want search engines to avoid cached copies.",
      rawValue
    ));
  }

  if (directives.noimageindex) {
    issues.push(issue(
      page,
      "low",
      `${source}_noimageindex`,
      `Page uses ${sourceLabel} noimageindex.`,
      "Use noimageindex only when you intentionally do not want images from this page indexed.",
      rawValue
    ));
  }

  if (isLimitedMaxSnippet(directives.maxSnippet)) {
    issues.push(issue(
      page,
      "recommended",
      `${source}_max_snippet_limited`,
      `Page limits text snippets with ${sourceLabel} max-snippet.`,
      "Use restrictive max-snippet values only when shorter search snippets are intentional.",
      `max-snippet=${directives.maxSnippet}; ${rawValue}`
    ));
  }

  if (isRestrictedImagePreview(directives.maxImagePreview)) {
    issues.push(issue(
      page,
      "recommended",
      `${source}_max_image_preview_restricted`,
      `Page restricts image previews with ${sourceLabel} max-image-preview.`,
      "Use max-image-preview:large for important product and collection pages unless image previews should be restricted.",
      `max-image-preview=${directives.maxImagePreview}; ${rawValue}`
    ));
  }

  if (isLimitedMaxVideoPreview(directives.maxVideoPreview)) {
    issues.push(issue(
      page,
      "recommended",
      `${source}_max_video_preview_limited`,
      `Page limits video previews with ${sourceLabel} max-video-preview.`,
      "Use restrictive max-video-preview values only when shorter video previews are intentional.",
      `max-video-preview=${directives.maxVideoPreview}; ${rawValue}`
    ));
  }

  if (directives.unavailableAfter) {
    issues.push(issue(
      page,
      "high",
      `${source}_unavailable_after`,
      `Page uses ${sourceLabel} unavailable_after.`,
      "Remove unavailable_after unless this page should disappear from search after the specified date.",
      `unavailable_after=${directives.unavailableAfter}; ${rawValue}`
    ));
  }
}

function isLimitedMaxSnippet(value: string): boolean {
  if (!value) return false;
  return value.trim() !== "-1";
}

function isRestrictedImagePreview(value: string): boolean {
  if (!value) return false;
  return ["none", "standard"].includes(value.trim().toLowerCase());
}

function isLimitedMaxVideoPreview(value: string): boolean {
  if (!value) return false;
  return value.trim() !== "-1";
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
