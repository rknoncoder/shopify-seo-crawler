import type { CrawledPage } from "../types/page.js";
import type { SiteProfile } from "../types/report.js";

export function buildSiteProfile(targetUrl: string, pages: CrawledPage[], commonIssues: Record<string, number>): SiteProfile {
  const apps = new Set<string>();
  const pageTypes: Record<string, number> = {};

  for (const page of pages) {
    pageTypes[page.pageType] = (pageTypes[page.pageType] || 0) + 1;
    page.shopify.detectedApps.forEach((app) => apps.add(app));
  }

  return {
    targetUrl,
    crawledAt: new Date().toISOString(),
    totalPages: pages.length,
    pageTypes,
    isShopify: pages.some((page) => page.shopify.isShopify),
    detectedApps: [...apps].sort(),
    commonIssues
  };
}
