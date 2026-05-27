import config from "../config/config.js";
import type { QueuedUrl } from "../types/crawl.js";
import type { DiscoverySource } from "../types/page.js";
import { normalizeUrl, shouldSkipUrl } from "../utils/urlUtils.js";

export class UrlManager {
  private readonly seen = new Set<string>();
  private readonly queue: QueuedUrl[] = [];

  constructor(private readonly baseUrl: string) {}

  add(url: string, depth: number, discoverySource?: DiscoverySource): boolean {
    if (this.seen.size >= config.maxPages || depth > config.maxDepth) return false;

    let normalized: string;
    try {
      normalized = normalizeUrl(url, this.baseUrl);
    } catch {
      return false;
    }

    if (this.seen.has(normalized) || shouldSkipUrl(normalized, this.baseUrl)) return false;
    this.seen.add(normalized);
    this.queue.push({ url: normalized, depth, discoverySource });
    return true;
  }

  next(): QueuedUrl | undefined {
    return this.queue.shift();
  }

  hasNext(): boolean {
    return this.queue.length > 0 && this.seen.size <= config.maxPages;
  }

  size(): number {
    return this.seen.size;
  }
}
