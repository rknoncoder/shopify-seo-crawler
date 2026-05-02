import config from "../config/config.js";
import { normalizeUrl, shouldSkipUrl } from "../utils/urlUtils.js";

export class UrlManager {
  private readonly seen = new Set<string>();
  private readonly queue: Array<{ url: string; depth: number }> = [];

  constructor(private readonly baseUrl: string) {}

  add(url: string, depth: number): boolean {
    if (this.seen.size >= config.maxPages || depth > config.maxDepth) return false;

    let normalized: string;
    try {
      normalized = normalizeUrl(url, this.baseUrl);
    } catch {
      return false;
    }

    if (this.seen.has(normalized) || shouldSkipUrl(normalized, this.baseUrl)) return false;
    this.seen.add(normalized);
    this.queue.push({ url: normalized, depth });
    return true;
  }

  next(): { url: string; depth: number } | undefined {
    return this.queue.shift();
  }

  hasNext(): boolean {
    return this.queue.length > 0 && this.seen.size <= config.maxPages;
  }

  size(): number {
    return this.seen.size;
  }
}
