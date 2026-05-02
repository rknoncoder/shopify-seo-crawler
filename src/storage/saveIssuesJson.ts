import type { SeoIssue } from "../types/issue.js";
import { saveJson } from "./saveJson.js";

export function saveIssuesJson(issues: SeoIssue[], path = "data/reports/issues.json"): Promise<string> {
  return saveJson(path, issues);
}
