import type { SeoIssue } from "../types/issue.js";
import type { AlternateLinkInfo, CrawledPage } from "../types/page.js";
import { normalizeCanonicalTarget, sameNormalizedUrl } from "../utils/indexability.js";
import { truncate } from "../utils/textUtils.js";

export function auditHreflang(page: CrawledPage): SeoIssue[] {
  const hreflangLinks = page.meta.alternates.filter(isHreflangCandidate);
  if (hreflangLinks.length === 0) return [];

  const issues: SeoIssue[] = [];
  const duplicateLanguages = duplicateHreflangValues(hreflangLinks);

  for (const link of hreflangLinks) {
    if (!link.href) {
      issues.push(issue(
        page,
        "medium",
        "hreflang_missing_href",
        "Hreflang alternate link is missing an href.",
        "Add an absolute or root-relative URL to each hreflang alternate link.",
        evidence(link)
      ));
    } else if (!isValidAlternateUrl(link.href, page.finalUrl)) {
      issues.push(issue(
        page,
        "medium",
        "hreflang_invalid_url",
        "Hreflang alternate link has an invalid URL.",
        "Use a valid HTTP or HTTPS URL for hreflang alternate links.",
        evidence(link)
      ));
    }

    if (!link.hreflang) {
      issues.push(issue(
        page,
        "medium",
        "hreflang_missing_value",
        "Alternate HTML link is missing a hreflang value.",
        "Add a language code such as en, en-IN, or x-default for alternate language URLs.",
        evidence(link)
      ));
    } else if (!isValidHreflangValue(link.hreflang)) {
      issues.push(issue(
        page,
        "medium",
        "hreflang_invalid_value",
        "Hreflang value is malformed.",
        "Use x-default or a valid language/region code such as en, en-IN, or hi-IN.",
        evidence(link)
      ));
    }
  }

  for (const hreflang of duplicateLanguages) {
    issues.push(issue(
      page,
      "medium",
      "hreflang_duplicate_value",
      "Multiple alternate links use the same hreflang value.",
      "Keep only one alternate URL for each hreflang value on a page.",
      `hreflang=${hreflang}`
    ));
  }

  if (hasValidHreflangSet(hreflangLinks) && !hasSelfReferencingAlternate(page, hreflangLinks)) {
    issues.push(issue(
      page,
      "recommended",
      "hreflang_self_reference_missing",
      "Hreflang set may be missing a self-referencing alternate.",
      "Include the current canonical URL in its own hreflang cluster.",
      `canonical=${normalizeCanonicalTarget(page.meta.canonical, page.finalUrl) || page.finalUrl}`
    ));
  }

  return issues;
}

function isHreflangCandidate(link: AlternateLinkInfo): boolean {
  if (link.hreflang) return true;
  const type = link.type.toLowerCase();
  return !type || type === "text/html";
}

function isValidAlternateUrl(href: string, baseUrl: string): boolean {
  try {
    const parsed = new URL(href, baseUrl);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidHreflangValue(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "x-default") return true;
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value);
}

function duplicateHreflangValues(links: AlternateLinkInfo[]): string[] {
  const counts = new Map<string, number>();
  for (const link of links) {
    if (!link.hreflang) continue;
    const normalized = link.hreflang.toLowerCase();
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([hreflang]) => hreflang);
}

function hasValidHreflangSet(links: AlternateLinkInfo[]): boolean {
  return links.some((link) => link.href && link.hreflang && isValidHreflangValue(link.hreflang));
}

function hasSelfReferencingAlternate(page: CrawledPage, links: AlternateLinkInfo[]): boolean {
  const currentUrl = normalizeCanonicalTarget(page.meta.canonical, page.finalUrl) || page.finalUrl;

  return links.some((link) => {
    if (!link.href) return false;
    try {
      return sameNormalizedUrl(new URL(link.href, page.finalUrl).toString(), currentUrl);
    } catch {
      return false;
    }
  });
}

function evidence(link: AlternateLinkInfo): string {
  return `hreflang=${link.hreflang}; href=${link.href}; type=${link.type}`;
}

function issue(
  page: CrawledPage,
  severity: SeoIssue["severity"],
  code: string,
  message: string,
  recommendation: string,
  evidenceText = ""
): SeoIssue {
  return {
    url: page.finalUrl,
    pageType: page.pageType,
    severity,
    category: "metadata",
    code,
    message,
    recommendation,
    evidence: truncate(evidenceText)
  };
}
