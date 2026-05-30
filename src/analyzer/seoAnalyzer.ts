import { detectBrokenCollectionLinks } from "./brokenCollectionLinkAnalyzer.js";
import { detectCanonicalIssues } from "./canonicalChecker.js";
import { detectContentCannibalizationIssues } from "./contentCannibalizationAnalyzer.js";
import { detectDuplicates } from "./duplicateDetector.js";
import { detectInternalLinkIssues } from "./internalLinkAnalyzer.js";
import { detectMetadataHreflangDeadLinks } from "./metadata.js";
import { detectRedirectIssues } from "./redirectAnalyzer.js";
import type { LinkGraph } from "../types/crawl.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function analyzeSite(pages: CrawledPage[], pageIssues: SeoIssue[], linkGraph: LinkGraph = new Map()): SeoIssue[] {
  return [
    ...pageIssues,
    ...detectDuplicates(pages),
    ...detectContentCannibalizationIssues(pages),
    ...detectCanonicalIssues(pages),
    ...detectRedirectIssues(pages),
    ...detectMetadataHreflangDeadLinks(pages),
    ...detectBrokenCollectionLinks(pages, linkGraph),
    ...detectInternalLinkIssues(pages)
  ];
}
