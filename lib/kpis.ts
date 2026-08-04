import type { TicketRecord } from "./customer-service-data";

export type KpiSummary = {
  ticketCount: number;
  csatPercent: number | null;
  averageFirstResponseMinutes: number | null;
  averageHandlingMinutes: number | null;
  resolutionRate: number | null;
  firstContactResolutionRate: number | null;
  slaComplianceRate: number | null;
  backlog: number;
};

const average = (values: number[]) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

const percent = (numerator: number, denominator: number) =>
  denominator ? (numerator / denominator) * 100 : null;

export function calculateKpis(records: TicketRecord[]): KpiSummary {
  const validResponses = records
    .map((record) => record.firstResponseMinutes)
    .filter((value): value is number => value !== null && value >= 0);
  const validHandling = records
    .map((record) => record.handlingMinutes)
    .filter((value): value is number => value !== null && value >= 0);
  const surveyed = records.filter(
    (record) =>
      record.csatScore !== null &&
      record.csatScore >= 1 &&
      record.csatScore <= 5,
  );
  const resolved = records.filter((record) => record.status === "Resolved");
  const slaEligible = records.filter(
    (record) =>
      record.firstResponseMinutes !== null &&
      record.firstResponseMinutes >= 0 &&
      record.slaTargetMinutes > 0,
  );

  return {
    ticketCount: records.length,
    csatPercent: percent(
      surveyed.filter((record) => (record.csatScore ?? 0) >= 4).length,
      surveyed.length,
    ),
    averageFirstResponseMinutes: average(validResponses),
    averageHandlingMinutes: average(validHandling),
    resolutionRate: percent(resolved.length, records.length),
    firstContactResolutionRate: percent(
      resolved.filter((record) => !record.reopened && !record.repeatContact)
        .length,
      resolved.length,
    ),
    slaComplianceRate: percent(
      slaEligible.filter(
        (record) =>
          (record.firstResponseMinutes ?? Infinity) <= record.slaTargetMinutes,
      ).length,
      slaEligible.length,
    ),
    backlog: records.filter((record) => record.status !== "Resolved").length,
  };
}

export function formatMetric(
  value: number | null,
  type: "number" | "percent" | "minutes",
) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (type === "percent") return `${value.toFixed(1)}%`;
  if (type === "minutes") return `${value.toFixed(1)} min`;
  return Math.round(value).toLocaleString("en-MY");
}

export type MetricDirection = "higher" | "lower";

export function compareMetric(
  current: number | null,
  previous: number | null,
  direction: MetricDirection,
) {
  if (current === null || previous === null) {
    return { delta: null, isImprovement: null };
  }
  const delta = current - previous;
  return {
    delta,
    isImprovement:
      delta === 0 ? null : direction === "higher" ? delta > 0 : delta < 0,
  };
}

export function meetsTarget(
  value: number | null,
  target: number,
  direction: MetricDirection,
) {
  if (value === null) return null;
  return direction === "higher" ? value >= target : value <= target;
}
