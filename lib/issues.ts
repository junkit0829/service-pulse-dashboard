import type {
  IssueCategory,
  TicketRecord,
} from "./customer-service-data";
import { calculateKpis, type KpiSummary } from "./kpis.ts";

export type FollowUpOwner =
  | "CX"
  | "Operations"
  | "Payment"
  | "Product"
  | "Technology";

export type IssueAnalysis = {
  category: IssueCategory;
  records: TicketRecord[];
  kpis: KpiSummary;
  volumeIndex: number;
  impactScore: number;
  priorityScore: number;
  priority: "Critical" | "High" | "Monitor";
  owner: FollowUpOwner;
};

const ownerByCategory: Record<IssueCategory, FollowUpOwner> = {
  "Account Access": "Technology",
  "Delivery Status": "Operations",
  "Payment Failed": "Payment",
  "Refund Request": "CX",
  "Product Question": "Product",
};

export function analyzeIssues(records: TicketRecord[]): IssueAnalysis[] {
  const groups = new Map<IssueCategory, TicketRecord[]>();
  records.forEach((record) => {
    groups.set(record.category, [
      ...(groups.get(record.category) ?? []),
      record,
    ]);
  });
  const maximumVolume = Math.max(
    1,
    ...[...groups.values()].map((items) => items.length),
  );

  return [...groups.entries()]
    .map(([category, categoryRecords]) => {
      const kpis = calculateKpis(categoryRecords);
      const dissatisfaction = 100 - (kpis.csatPercent ?? 50);
      const unresolved = 100 - (kpis.resolutionRate ?? 0);
      const responsePressure = Math.min(
        100,
        ((kpis.averageFirstResponseMinutes ?? 0) / 60) * 100,
      );
      const impactScore =
        dissatisfaction * 0.4 + unresolved * 0.35 + responsePressure * 0.25;
      const volumeIndex = (categoryRecords.length / maximumVolume) * 100;
      const priorityScore = volumeIndex * 0.4 + impactScore * 0.6;
      return {
        category,
        records: categoryRecords,
        kpis,
        volumeIndex,
        impactScore,
        priorityScore,
        priority:
          priorityScore >= 65
            ? "Critical"
            : priorityScore >= 45
              ? "High"
              : "Monitor",
        owner: ownerByCategory[category],
      } satisfies IssueAnalysis;
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);
}

