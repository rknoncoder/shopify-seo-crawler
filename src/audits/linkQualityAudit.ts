import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage, LinkInfo } from "../types/page.js";
import { truncate } from "../utils/textUtils.js";

const absoluteUrlPattern = /^https?:\/\//i;
const encodedAbsoluteUrlInPathPattern = /\/(?:%20|%c2%a0|&nbsp;|\s)+https?:\/\//i;

export function auditLinkQuality(page: CrawledPage): SeoIssue[] {
  const malformedLinks = page.links.filter((link) => link.internal && isMalformedInternalLink(link));
  if (malformedLinks.length === 0) return [];

  return [{
    url: page.finalUrl,
    pageType: page.pageType,
    severity: "medium",
    category: "technical",
    code: "malformed_internal_link",
    message: `${malformedLinks.length} malformed internal links found.`,
    recommendation: "Fix the original href value in the theme, product description, page content, or app output. Remove leading spaces, non-breaking spaces, and accidentally nested full URLs.",
    evidence: truncate(malformedLinks.slice(0, 5).map(formatEvidence).join(" | "), 300)
  }];
}

function isMalformedInternalLink(link: LinkInfo): boolean {
  const rawHref = link.rawHref || "";
  const trimmedHref = rawHref.trim();

  if (!trimmedHref) return false;

  if (rawHref !== trimmedHref && absoluteUrlPattern.test(trimmedHref)) {
    return true;
  }

  const lowerHref = link.href.toLowerCase();
  if (encodedAbsoluteUrlInPathPattern.test(lowerHref)) {
    return true;
  }

  const decodedHref = decodeUrlSafely(lowerHref);
  return encodedAbsoluteUrlInPathPattern.test(decodedHref);
}

function decodeUrlSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatEvidence(link: LinkInfo): string {
  return `raw="${link.rawHref}" normalized="${link.href}"`;
}
