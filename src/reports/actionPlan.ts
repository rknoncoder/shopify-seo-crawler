import type { SeoIssue } from "../types/issue.js";
import type { ActionPlanItem } from "../types/report.js";

const severityRank: Record<SeoIssue["severity"], number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
  recommended: 5,
  info: 6
};

export function buildActionPlan(issues: SeoIssue[]): ActionPlanItem[] {
  const groups = new Map<string, SeoIssue[]>();

  for (const issue of issues) {
    const key = `${issue.severity}:${issue.category}:${issue.code}:${issue.recommendation}`;
    groups.set(key, [...(groups.get(key) || []), issue]);
  }

  return [...groups.values()]
    .sort((a, b) => severityRank[a[0].severity] - severityRank[b[0].severity] || b.length - a.length)
    .map((group, index) => ({
      priority: index + 1,
      severity: group[0].severity,
      category: group[0].category,
      task: `${group[0].message} ${group[0].recommendation}`,
      affectedUrls: group.length,
      sampleUrls: group.slice(0, 5).map((issue) => issue.url)
    }));
}

export function countIssuesByCode(issues: SeoIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {});
}
