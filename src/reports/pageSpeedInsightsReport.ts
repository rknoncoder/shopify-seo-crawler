import axios from "axios";

export type PageSpeedStrategy = "mobile" | "desktop";

export interface PageSpeedInsightsOptions {
  enabled: boolean;
  limit: number;
  strategy: PageSpeedStrategy;
  apiKey?: string;
}

export interface PageSpeedInsightsRow {
  url: string;
  strategy: PageSpeedStrategy;
  status: "ok" | "error";
  error: string;
  fetchTime: string;
  performanceScore: number | "";
  accessibilityScore: number | "";
  bestPracticesScore: number | "";
  seoScore: number | "";
  firstContentfulPaintMs: number | "";
  largestContentfulPaintMs: number | "";
  speedIndexMs: number | "";
  totalBlockingTimeMs: number | "";
  cumulativeLayoutShift: number | "";
  interactiveMs: number | "";
  cruxLargestContentfulPaintMs: number | "";
  cruxCumulativeLayoutShift: number | "";
  cruxInteractionToNextPaintMs: number | "";
  topOpportunities: string;
}

interface LighthouseAudit {
  id?: string;
  title?: string;
  displayValue?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  numericValue?: number;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
  };
}

interface PageSpeedApiResponse {
  lighthouseResult?: {
    fetchTime?: string;
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, LighthouseAudit>;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>;
  };
  error?: {
    message?: string;
  };
}

const endpoint = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const categories = ["performance", "accessibility", "best-practices", "seo"];

export async function buildPageSpeedInsightsReport(urls: string[], options: PageSpeedInsightsOptions): Promise<PageSpeedInsightsRow[]> {
  if (!options.enabled) return [];

  const rows: PageSpeedInsightsRow[] = [];
  const selectedUrls = urls.slice(0, options.limit);

  for (const url of selectedUrls) {
    rows.push(await fetchPageSpeedInsights(url, options));
  }

  return rows;
}

async function fetchPageSpeedInsights(url: string, options: PageSpeedInsightsOptions): Promise<PageSpeedInsightsRow> {
  try {
    const params = new URLSearchParams();
    params.set("url", url);
    params.set("strategy", options.strategy);
    categories.forEach((category) => params.append("category", category));
    if (options.apiKey) params.set("key", options.apiKey);

    const response = await axios.get<PageSpeedApiResponse>(`${endpoint}?${params.toString()}`, {
      timeout: 120000,
      validateStatus: () => true
    });

    if (response.status >= 400 || response.data.error) {
      return errorRow(url, options.strategy, response.data.error?.message || `HTTP ${response.status}`);
    }

    return successRow(url, options.strategy, response.data);
  } catch (error) {
    return errorRow(url, options.strategy, error instanceof Error ? error.message : String(error));
  }
}

function successRow(url: string, strategy: PageSpeedStrategy, data: PageSpeedApiResponse): PageSpeedInsightsRow {
  const audits = data.lighthouseResult?.audits || {};
  const categories = data.lighthouseResult?.categories || {};
  const crux = data.loadingExperience?.metrics || {};

  return {
    url,
    strategy,
    status: "ok",
    error: "",
    fetchTime: data.lighthouseResult?.fetchTime || "",
    performanceScore: score(categories.performance?.score),
    accessibilityScore: score(categories.accessibility?.score),
    bestPracticesScore: score(categories["best-practices"]?.score),
    seoScore: score(categories.seo?.score),
    firstContentfulPaintMs: metric(audits["first-contentful-paint"]),
    largestContentfulPaintMs: metric(audits["largest-contentful-paint"]),
    speedIndexMs: metric(audits["speed-index"]),
    totalBlockingTimeMs: metric(audits["total-blocking-time"]),
    cumulativeLayoutShift: metric(audits["cumulative-layout-shift"]),
    interactiveMs: metric(audits.interactive),
    cruxLargestContentfulPaintMs: crux.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? "",
    cruxCumulativeLayoutShift: crux.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? "",
    cruxInteractionToNextPaintMs: crux.INTERACTION_TO_NEXT_PAINT?.percentile ?? "",
    topOpportunities: topOpportunities(audits)
  };
}

function errorRow(url: string, strategy: PageSpeedStrategy, error: string): PageSpeedInsightsRow {
  return {
    url,
    strategy,
    status: "error",
    error,
    fetchTime: "",
    performanceScore: "",
    accessibilityScore: "",
    bestPracticesScore: "",
    seoScore: "",
    firstContentfulPaintMs: "",
    largestContentfulPaintMs: "",
    speedIndexMs: "",
    totalBlockingTimeMs: "",
    cumulativeLayoutShift: "",
    interactiveMs: "",
    cruxLargestContentfulPaintMs: "",
    cruxCumulativeLayoutShift: "",
    cruxInteractionToNextPaintMs: "",
    topOpportunities: ""
  };
}

function score(value: number | null | undefined): number | "" {
  return typeof value === "number" ? Math.round(value * 100) : "";
}

function metric(audit: LighthouseAudit | undefined): number | "" {
  return typeof audit?.numericValue === "number" ? Math.round(audit.numericValue) : "";
}

function topOpportunities(audits: Record<string, LighthouseAudit>): string {
  return Object.values(audits)
    .filter((audit) => audit.details?.type === "opportunity")
    .sort((a, b) => (b.details?.overallSavingsMs || 0) - (a.details?.overallSavingsMs || 0))
    .slice(0, 5)
    .map((audit) => `${audit.title || audit.id}: ${audit.displayValue || `${Math.round(audit.details?.overallSavingsMs || 0)} ms`}`)
    .join(" | ");
}
