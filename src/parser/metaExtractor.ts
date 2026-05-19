import type { CheerioAPI } from "cheerio";
import type { PageMeta } from "../types/page.js";

export function extractMeta($: CheerioAPI): PageMeta {
  return {
    title: $("title").first().text().trim(),
    description: $('meta[name="description"]').attr("content")?.trim() || "",
    canonical: $('link[rel="canonical"]').attr("href")?.trim() || "",
    robots: $('meta[name="robots"]').attr("content")?.trim() || "",
    alternates: extractAlternates($),
    ogTitle: $('meta[property="og:title"]').attr("content")?.trim() || "",
    ogDescription: $('meta[property="og:description"]').attr("content")?.trim() || "",
    ogType: $('meta[property="og:type"]').attr("content")?.trim() || "",
    ogUrl: $('meta[property="og:url"]').attr("content")?.trim() || "",
    ogImage: $('meta[property="og:image"]').attr("content")?.trim() || "",
    ogImageWidth: $('meta[property="og:image:width"]').attr("content")?.trim() || "",
    ogImageHeight: $('meta[property="og:image:height"]').attr("content")?.trim() || "",
    twitterCard: $('meta[name="twitter:card"]').attr("content")?.trim() || "",
    twitterTitle: $('meta[name="twitter:title"]').attr("content")?.trim() || "",
    twitterDescription: $('meta[name="twitter:description"]').attr("content")?.trim() || "",
    twitterImage: $('meta[name="twitter:image"]').attr("content")?.trim() || ""
  };
}

function extractAlternates($: CheerioAPI): PageMeta["alternates"] {
  return $('link[rel]')
    .map((_, element) => {
      const link = $(element);
      const relValues = (link.attr("rel") || "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!relValues.includes("alternate")) return null;

      return {
        href: link.attr("href")?.trim() || "",
        hreflang: link.attr("hreflang")?.trim() || "",
        type: link.attr("type")?.trim() || "",
        title: link.attr("title")?.trim() || ""
      };
    })
    .get()
    .filter((alternate): alternate is PageMeta["alternates"][number] => Boolean(alternate));
}
