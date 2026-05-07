import type { CheerioAPI } from "cheerio";
import type { LinkInfo } from "../types/page.js";
import { cleanText } from "../utils/textUtils.js";
import { isSameOrigin, normalizeUrl } from "../utils/urlUtils.js";

export function extractLinks($: CheerioAPI, baseUrl: string): LinkInfo[] {
  const seen = new Set<string>();

  return $("a[href]")
    .map((_, element) => {
      const anchor = $(element);
      const href = anchor.attr("href") || "";
      let url: string;
      try {
        url = normalizeUrl(href, baseUrl);
      } catch {
        return null;
      }

      const seenKey = `${url}\n${href}`;
      if (seen.has(seenKey)) return null;
      seen.add(seenKey);

      return {
        href: url,
        rawHref: href,
        text: cleanText(anchor.text()),
        rel: (anchor.attr("rel") || "").split(/\s+/).filter(Boolean),
        internal: isSameOrigin(url, baseUrl)
      };
    })
    .get()
    .filter((link): link is LinkInfo => Boolean(link));
}
