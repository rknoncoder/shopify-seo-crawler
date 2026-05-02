import type { SiteProfile } from "../types/report.js";
import { saveCsv } from "./saveCsv.js";

export function saveSiteProfileCsv(profile: SiteProfile, path = "data/reports/site-profile.csv"): Promise<string> {
  return saveCsv(path, [{
    targetUrl: profile.targetUrl,
    crawledAt: profile.crawledAt,
    totalPages: profile.totalPages,
    isShopify: profile.isShopify,
    pageTypes: JSON.stringify(profile.pageTypes),
    detectedApps: profile.detectedApps.join("|"),
    commonIssues: JSON.stringify(profile.commonIssues)
  }]);
}
