import { detectCanonicalIssues } from "./canonicalChecker.js";
import { detectContentCannibalizationIssues } from "./contentCannibalizationAnalyzer.js";
import { detectDuplicates } from "./duplicateDetector.js";
import { detectInternalLinkIssues } from "./internalLinkAnalyzer.js";
import { detectMetadataHreflangDeadLinks } from "./metadata.js";
import { detectRedirectIssues } from "./redirectAnalyzer.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function analyzeSite(pages: CrawledPage[], pageIssues: SeoIssue[]): SeoIssue[] {
  return [
    ...pageIssues,
    ...detectDuplicates(pages),
    ...detectContentCannibalizationIssues(pages),
    ...detectCanonicalIssues(pages),
    ...detectRedirectIssues(pages),
    ...detectMetadataHreflangDeadLinks(pages),
    ...detectInternalLinkIssues(pages)
  ];
}
