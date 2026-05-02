import type { SeoIssue } from "../types/issue.js";
import { saveCsv } from "./saveCsv.js";

export function saveIssuesCsv(issues: SeoIssue[], path = "data/reports/issues.csv"): Promise<string> {
  return saveCsv(path, issues);
}
