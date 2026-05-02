const facetedParams = [
  "filter.",
  "sort_by",
  "view",
  "variant",
  "price",
  "availability",
  "vendor",
  "type",
  "color",
  "size"
];

export function isFacetedUrl(url: string): boolean {
  const parsed = new URL(url);
  const query = parsed.search.toLowerCase();
  return facetedParams.some((param) => query.includes(param));
}

export function stripFacets(url: string): string {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) {
    if (facetedParams.some((param) => key.toLowerCase().startsWith(param))) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}
