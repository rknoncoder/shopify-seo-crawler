import { createHash } from "node:crypto";

export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function countWords(value: string): number {
  const text = cleanText(value);
  return text ? text.split(/\s+/).length : 0;
}

export function hashText(value: string): string {
  return createHash("sha1").update(cleanText(value).toLowerCase()).digest("hex");
}

export function truncate(value: string, length = 140): string {
  const text = cleanText(value);
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
}
