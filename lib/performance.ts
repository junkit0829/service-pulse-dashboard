import type { TicketRecord } from "./customer-service-data";
import { calculateKpis, type KpiSummary } from "./kpis.ts";

export type PerformanceDimension =
  | "team"
  | "agent"
  | "channel"
  | "category"
  | "segment";

export type PerformanceMetric =
  | "csatPercent"
  | "averageFirstResponseMinutes"
  | "resolutionRate"
  | "slaComplianceRate";

export type PerformanceGroup = {
  name: string;
  records: TicketRecord[];
  kpis: KpiSummary;
};

export function groupPerformance(
  records: TicketRecord[],
  dimension: PerformanceDimension,
): PerformanceGroup[] {
  const groups = new Map<string, TicketRecord[]>();
  records.forEach((record) => {
    const key = String(record[dimension]);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  return [...groups.entries()].map(([name, groupRecords]) => ({
    name,
    records: groupRecords,
    kpis: calculateKpis(groupRecords),
  }));
}

export function metricValue(
  group: PerformanceGroup,
  metric: PerformanceMetric,
) {
  return group.kpis[metric];
}

export function findLargestContributor(
  current: PerformanceGroup[],
  previous: PerformanceGroup[],
  metric: PerformanceMetric,
) {
  return current
    .map((group) => {
      const prior = previous.find((item) => item.name === group.name);
      const currentValue = metricValue(group, metric);
      const previousValue = prior ? metricValue(prior, metric) : null;
      return {
        name: group.name,
        currentValue,
        previousValue,
        delta:
          currentValue === null || previousValue === null
            ? null
            : currentValue - previousValue,
      };
    })
    .filter((item) => item.delta !== null)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))[0] ?? null;
}
