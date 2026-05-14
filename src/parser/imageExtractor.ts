import type { CheerioAPI } from "cheerio";
import type { ImageInfo } from "../types/page.js";

export function extractImages($: CheerioAPI, baseUrl: string): ImageInfo[] {
  return $("img")
    .map((_, element) => {
      const image = $(element);
      const rawSrc = image.attr("src") || image.attr("data-src") || image.attr("data-original") || "";
      return {
        src: normalizeImageSrc(rawSrc, baseUrl),
        rawSrc,
        alt: image.attr("alt")?.trim() || "",
        width: image.attr("width"),
        height: image.attr("height"),
        lazy: image.attr("loading") === "lazy" || Boolean(image.attr("data-src"))
      };
    })
    .get()
    .filter((image) => Boolean(image.src));
}

function normalizeImageSrc(src: string, baseUrl: string): string {
  if (!src) return "";
  if (src.startsWith("//")) return `https:${src}`;
  try {
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}
