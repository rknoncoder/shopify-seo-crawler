import type { CheerioAPI } from "cheerio";
import { cleanText, countWords, hashText } from "../utils/textUtils.js";

export function extractVisibleText($: CheerioAPI): string {
  const clone = $.root().clone();
  clone.find("script,style,noscript,svg,template").remove();
  return cleanText(clone.text());
}

export function extractContentSummary($: CheerioAPI): { wordCount: number; textHash: string } {
  const text = extractVisibleText($);
  return {
    wordCount: countWords(text),
    textHash: hashText(text)
  };
}
