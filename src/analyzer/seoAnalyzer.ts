import { detectCanonicalIssues } from "./canonicalChecker.js";
import { detectDuplicates } from "./dublicateDetector.js";
import type { SeoIssue } from "../types/issue.js";
import type { CrawledPage } from "../types/page.js";

export function analyzeSite(pages: CrawledPage[], pageIssues: SeoIssue[]): SeoIssue[] {
  return [
    ...pageIssues,
    ...detectDuplicates(pages),
    ...detectCanonicalIssues(pages)
  ];
}
