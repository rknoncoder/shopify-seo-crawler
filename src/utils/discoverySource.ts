import type { DiscoverySource } from "../types/page.js";

export type ReachableVia = "api_seed" | "sitemap_only" | "pagination_probe";

export function toReachableVia(discoverySource: DiscoverySource | string | undefined): ReachableVia | undefined {
  if (discoverySource === "api_probe" || discoverySource === "api_seed") return "api_seed";
  if (discoverySource === "sitemap_unlisted") return "sitemap_only";
  if (discoverySource === "pagination_probe") return "pagination_probe";
  return undefined;
}
