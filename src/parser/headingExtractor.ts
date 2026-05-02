import type { CheerioAPI } from "cheerio";
import type { HeadingSummary } from "../types/page.js";
import { cleanText } from "../utils/textUtils.js";

export function extractHeadings($: CheerioAPI): HeadingSummary {
  return {
    h1: $("h1").map((_, element) => cleanText($(element).text())).get().filter(Boolean),
    h2: $("h2").map((_, element) => cleanText($(element).text())).get().filter(Boolean),
    h3: $("h3").map((_, element) => cleanText($(element).text())).get().filter(Boolean)
  };
}
