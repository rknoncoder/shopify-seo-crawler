import type { CheerioAPI } from "cheerio";
import type { PageMeta } from "../types/page.js";

export function extractMeta($: CheerioAPI): PageMeta {
  return {
    title: $("title").first().text().trim(),
    description: $('meta[name="description"]').attr("content")?.trim() || "",
    canonical: $('link[rel="canonical"]').attr("href")?.trim() || "",
    robots: $('meta[name="robots"]').attr("content")?.trim() || "",
    ogTitle: $('meta[property="og:title"]').attr("content")?.trim() || "",
    ogDescription: $('meta[property="og:description"]').attr("content")?.trim() || "",
    ogImage: $('meta[property="og:image"]').attr("content")?.trim() || "",
    twitterTitle: $('meta[name="twitter:title"]').attr("content")?.trim() || "",
    twitterDescription: $('meta[name="twitter:description"]').attr("content")?.trim() || ""
  };
}
