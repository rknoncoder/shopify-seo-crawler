import type { ImageInventoryUsage } from "../types/image.js";

export interface ImageInventoryRow {
  imageUrl: string;
  alt: string;
  usedCount: number;
  pagesUsed: number;
  pageTypes: string;
  missingAlt: boolean;
  samplePages: string;
  widthValues: string;
  heightValues: string;
  lazyCount: number;
  eagerCount: number;
  fetchPriorityValues: string;
}

interface ImageInventoryGroup {
  imageUrl: string;
  alt: string;
  usedCount: number;
  pageUrls: Set<string>;
  pageTypes: Set<string>;
  widthValues: Set<string>;
  heightValues: Set<string>;
  fetchPriorityValues: Set<string>;
  lazyCount: number;
  eagerCount: number;
}

export function buildImageInventoryReport(usages: ImageInventoryUsage[]): ImageInventoryRow[] {
  const groups = new Map<string, ImageInventoryGroup>();

  for (const usage of usages) {
    const imageUrl = usage.imageUrl.trim();
    if (!imageUrl) continue;

    const alt = usage.alt.trim();
    const key = `${imageUrl}\n${alt}`;
    const group = groups.get(key) || {
      imageUrl,
      alt,
      usedCount: 0,
      pageUrls: new Set<string>(),
      pageTypes: new Set<string>(),
      widthValues: new Set<string>(),
      heightValues: new Set<string>(),
      fetchPriorityValues: new Set<string>(),
      lazyCount: 0,
      eagerCount: 0
    };

    group.usedCount += 1;
    group.pageUrls.add(usage.pageUrl);
    group.pageTypes.add(usage.pageType);
    if (usage.width) group.widthValues.add(usage.width);
    if (usage.height) group.heightValues.add(usage.height);
    if (usage.fetchPriority) group.fetchPriorityValues.add(usage.fetchPriority);
    if (usage.lazy) group.lazyCount += 1;
    else group.eagerCount += 1;

    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      imageUrl: group.imageUrl,
      alt: group.alt,
      usedCount: group.usedCount,
      pagesUsed: group.pageUrls.size,
      pageTypes: [...group.pageTypes].sort().join("|"),
      missingAlt: group.alt === "",
      samplePages: [...group.pageUrls].slice(0, 10).join("|"),
      widthValues: [...group.widthValues].sort().join("|"),
      heightValues: [...group.heightValues].sort().join("|"),
      lazyCount: group.lazyCount,
      eagerCount: group.eagerCount,
      fetchPriorityValues: [...group.fetchPriorityValues].sort().join("|")
    }))
    .sort((left, right) => {
      if (left.missingAlt !== right.missingAlt) return left.missingAlt ? -1 : 1;
      return right.usedCount - left.usedCount || left.imageUrl.localeCompare(right.imageUrl) || left.alt.localeCompare(right.alt);
    });
}
