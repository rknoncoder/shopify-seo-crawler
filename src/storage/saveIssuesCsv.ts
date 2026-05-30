import type { SeoIssue } from "../types/issue.js";
import { saveCsv } from "./saveCsv.js";

export function saveIssuesCsv(issues: SeoIssue[], path = "data/reports/issues.csv"): Promise<string> {
  return saveCsv(path, issues, issueHeaders);
}

const issueHeaders: Array<keyof SeoIssue> = [
  "url",
  "pageType",
  "severity",
  "category",
  "code",
  "issue",
  "handle",
  "noindex_source",
  "noindex_removable",
  "message",
  "recommendation",
  "evidence",
  "inbound_sources",
  "reachable_via"
];
