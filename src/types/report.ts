import type { SeoIssue } from "./issue.js";

export interface SiteProfile {
  targetUrl: string;
  crawledAt: string;
  totalPages: number;
  pageTypes: Record<string, number>;
  isShopify: boolean;
  detectedApps: string[];
  commonIssues: Record<string, number>;
}

export interface ActionPlanItem {
  priority: number;
  severity: SeoIssue["severity"];
  category: SeoIssue["category"];
  task: string;
  affectedUrls: number;
  sampleUrls: string[];
}
