import axios from "axios";
import * as cheerio from "cheerio";
import config from "../config/config.js";
import { normalizeSitemapUrl } from "../utils/urlUtils.js";

export interface SitemapDetectionResult {
  sitemapUrls: string[];
  source: "manual" | "robots" | "common" | "none";
  status: "found" | "missing" | "error" | "skipped";
  attempts: Array<{ url: string; status: string }>;
  detectedSeoPlugins: string[];
  unavailableReason: string;
}

export async function detectSitemapUrls(targetUrl: string): Promise<SitemapDetectionResult> {
  const origin = new URL(targetUrl).origin;
  const attempts: SitemapDetectionResult["attempts"] = [];
  const robotsUrl = `${origin}/robots.txt`;

  try {
    const robots = await axios.get<string>(robotsUrl, {
      timeout: config.timeout,
      headers: { "User-Agent": config.userAgent },
      validateStatus: () => true
    });
    attempts.push({ url: robotsUrl, status: String(robots.status) });

    if (robots.status < 400 && typeof robots.data === "string") {
      const urls = robots.data
        .split(/\r?\n/)
        .map((line) => line.match(/^sitemap:\s*(.+)$/i)?.[1]?.trim())
        .filter((url): url is string => Boolean(url))
        .map((url) => normalizeSitemapUrl(url, origin));

      if (urls.length > 0) {
        return found([...new Set(urls)], "robots", attempts);
      }
    }
  } catch (error) {
    attempts.push({ url: robotsUrl, status: error instanceof Error ? error.message : "error" });
  }

  for (const path of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap_products_1.xml"]) {
    const sitemapUrl = `${origin}${path}`;
    try {
      const response = await axios.get<string>(sitemapUrl, {
        timeout: config.timeout,
        headers: { "User-Agent": config.userAgent },
        validateStatus: () => true
      });
      attempts.push({ url: sitemapUrl, status: String(response.status) });

      if (response.status < 400 && looksLikeSitemap(response.data)) {
        return found([sitemapUrl], "common", attempts);
      }
    } catch (error) {
      attempts.push({ url: sitemapUrl, status: error instanceof Error ? error.message : "error" });
    }
  }

  return {
    sitemapUrls: [],
    source: "none",
    status: "missing",
    attempts,
    detectedSeoPlugins: [],
    unavailableReason: "No sitemap URL was found in robots.txt or common Shopify sitemap paths."
  };
}

export async function inspectSitemapIndex(sitemapUrl: string): Promise<{
  type: "index" | "urlset" | "unknown";
  urlCount: number;
  childSitemaps: Array<{ sitemapUrl: string; type: "urlset"; sitemapType: string; urlCount: number }>;
}> {
  const xml = await fetchXml(sitemapUrl);
  const $ = cheerio.load(xml, { xmlMode: true });
  const childUrls = $("sitemap > loc").map((_, element) => $(element).text().trim()).get();

  if (childUrls.length > 0) {
    const childSitemaps = [];
    for (const childUrl of childUrls) {
      const childXml = await fetchXml(childUrl);
      const child = cheerio.load(childXml, { xmlMode: true });
      childSitemaps.push({
        sitemapUrl: childUrl,
        type: "urlset" as const,
        sitemapType: classifySitemapByUrlName(childUrl),
        urlCount: child("url > loc").length
      });
    }
    return { type: "index", urlCount: childSitemaps.reduce((sum, item) => sum + item.urlCount, 0), childSitemaps };
  }

  const urlCount = $("url > loc").length;
  return { type: urlCount > 0 ? "urlset" : "unknown", urlCount, childSitemaps: [] };
}

export async function parseSitemap(sitemapUrl: string, options: { limit?: number } = {}): Promise<{ urls: string[] }> {
  const xml = await fetchXml(sitemapUrl);
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = $("url > loc")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean);
  return { urls: typeof options.limit === "number" ? urls.slice(0, options.limit) : urls };
}

export function classifySitemapByUrlName(sitemapUrl: string): string {
  const lowerUrl = sitemapUrl.toLowerCase();
  if (lowerUrl.includes("product")) return "product";
  if (lowerUrl.includes("collection")) return "collection";
  if (lowerUrl.includes("blog") || lowerUrl.includes("article")) return "blog";
  if (lowerUrl.includes("page")) return "page";
  if (lowerUrl.includes("policy")) return "policy";
  return "other";
}

async function fetchXml(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: config.timeout,
    headers: { "User-Agent": config.userAgent, Accept: "application/xml,text/xml,*/*" },
    validateStatus: () => true
  });

  if (response.status >= 400) {
    throw new Error(`Unable to fetch sitemap ${url}: ${response.status}`);
  }

  return String(response.data);
}

function looksLikeSitemap(value: string): boolean {
  return /<(urlset|sitemapindex)[\s>]/i.test(value);
}

function found(
  sitemapUrls: string[],
  source: SitemapDetectionResult["source"],
  attempts: SitemapDetectionResult["attempts"]
): SitemapDetectionResult {
  return {
    sitemapUrls,
    source,
    status: "found",
    attempts,
    detectedSeoPlugins: [],
    unavailableReason: ""
  };
}
