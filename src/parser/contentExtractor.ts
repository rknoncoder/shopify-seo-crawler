import type { CheerioAPI } from "cheerio";
import { cleanText, countWords, hashText } from "../utils/textUtils.js";

export function extractVisibleText($: CheerioAPI): string {
  const clone = $.root().clone();
  clone.find("script,style,noscript,svg,template").remove();
  return cleanText(clone.text());
}

const maxTextSampleLength = 6000;

export function extractContentSummary($: CheerioAPI): { wordCount: number; textSample: string; textHash: string } {
  const text = extractVisibleText($);
  return {
    wordCount: countWords(text),
    textSample: text.slice(0, maxTextSampleLength),
    textHash: hashText(text)
  };
}
