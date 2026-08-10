import type {
  Channel,
  CustomerSegment,
  IssueCategory,
  Team,
  TicketRecord,
  TicketStatus,
  WorkflowStage,
} from "./customer-service-data";
import { calculateKpis } from "./kpis.ts";

export const importFields = [
  { key: "id", label: "Ticket ID", required: true },
  { key: "createdAt", label: "Created date", required: true },
  { key: "team", label: "Team", required: true },
  { key: "agent", label: "Agent", required: true },
  { key: "channel", label: "Channel", required: true },
  { key: "category", label: "Issue category", required: true },
  { key: "segment", label: "Customer segment", required: false },
  { key: "status", label: "Status", required: true },
  { key: "firstResponseMinutes", label: "First response minutes", required: false },
  { key: "handlingMinutes", label: "Handling minutes", required: false },
  { key: "csatScore", label: "CSAT score", required: false },
  { key: "slaTargetMinutes", label: "SLA target minutes", required: false },
  { key: "reopened", label: "Reopened", required: false },
  { key: "repeatContact", label: "Repeat contact", required: false },
  { key: "chatbotOutcome", label: "Chatbot outcome", required: false },
  { key: "requiredFieldsComplete", label: "Required fields complete", required: false },
  { key: "crmProfileLinked", label: "CRM profile linked", required: false },
  { key: "routingMode", label: "Routing mode", required: false },
  { key: "knowledgeBaseUsed", label: "Knowledge base used", required: false },
  { key: "workflowBypassed", label: "Workflow bypassed", required: false },
] as const;

export type ImportFieldKey = (typeof importFields)[number]["key"];
export type ColumnMapping = Partial<Record<ImportFieldKey, string>>;

const teams: Team[] = ["Customer Service", "Operations", "Payment"];
const channels: Channel[] = ["Email", "Live Chat", "Phone", "Chatbot"];
const categories: IssueCategory[] = [
  "Account Access",
  "Delivery Status",
  "Payment Failed",
  "Refund Request",
  "Product Question",
];
const statuses: TicketStatus[] = ["Resolved", "Open", "Pending"];

const value = (
  row: Record<string, unknown>,
  mapping: ColumnMapping,
  key: ImportFieldKey,
) => {
  const source = mapping[key];
  return source ? row[source] : undefined;
};

const nullableNumber = (input: unknown) => {
  if (input === undefined || input === null || input === "") return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
};

const booleanValue = (input: unknown, fallback = false) => {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  if (typeof input === "string") {
    return ["true", "yes", "1", "y"].includes(input.toLowerCase());
  }
  return fallback;
};

export function autoMapColumns(headers: string[]): ColumnMapping {
  const normalized = new Map(
    headers.map((header) => [
      header.toLowerCase().replace(/[^a-z0-9]/g, ""),
      header,
    ]),
  );
  return Object.fromEntries(
    importFields
      .map((field) => [
        field.key,
        normalized.get(field.key.toLowerCase().replace(/[^a-z0-9]/g, "")),
      ])
      .filter((entry) => entry[1]),
  );
}

export function validateAndNormalizeRows(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
) {
  const errors: string[] = [];
  const missing = importFields
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label);
  if (missing.length) {
    return {
      records: [] as TicketRecord[],
      errors: [`Map required columns: ${missing.join(", ")}.`],
    };
  }

  const seen = new Set<string>();
  const records = rows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const id = String(value(row, mapping, "id") ?? "").trim();
    const createdAt = String(value(row, mapping, "createdAt") ?? "").slice(0, 10);
    const team = String(value(row, mapping, "team") ?? "") as Team;
    const channel = String(value(row, mapping, "channel") ?? "") as Channel;
    const category = String(value(row, mapping, "category") ?? "") as IssueCategory;
    const status = String(value(row, mapping, "status") ?? "") as TicketStatus;
    const agent = String(value(row, mapping, "agent") ?? "").trim();
    const rowErrors: string[] = [];
    if (!id) rowErrors.push("missing ticket ID");
    if (seen.has(id)) rowErrors.push("duplicate ticket ID");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(createdAt)) rowErrors.push("invalid date");
    if (!teams.includes(team)) rowErrors.push("invalid team");
    if (!channels.includes(channel)) rowErrors.push("invalid channel");
    if (!categories.includes(category)) rowErrors.push("invalid category");
    if (!statuses.includes(status)) rowErrors.push("invalid status");
    if (!agent) rowErrors.push("missing agent");
    if (rowErrors.length) {
      errors.push(`Row ${rowNumber}: ${rowErrors.join(", ")}.`);
      return [];
    }
    seen.add(id);
    const segmentValue = String(
      value(row, mapping, "segment") ?? "Standard",
    ) as CustomerSegment;
    const workflowStage: WorkflowStage =
      status === "Resolved"
        ? "Resolved"
        : status === "Pending"
          ? "Waiting"
          : "In Progress";
    return [{
      id,
      createdAt,
      team,
      agent,
      channel,
      category,
      segment: ["Premium", "Standard", "New"].includes(segmentValue)
        ? segmentValue
        : "Standard",
      status,
      firstResponseMinutes: nullableNumber(
        value(row, mapping, "firstResponseMinutes"),
      ),
      handlingMinutes: nullableNumber(value(row, mapping, "handlingMinutes")),
      csatScore: nullableNumber(value(row, mapping, "csatScore")),
      slaTargetMinutes:
        nullableNumber(value(row, mapping, "slaTargetMinutes")) ?? 60,
      reopened: booleanValue(value(row, mapping, "reopened")),
      repeatContact: booleanValue(value(row, mapping, "repeatContact")),
      chatbotOutcome:
        channel === "Chatbot"
          ? (String(value(row, mapping, "chatbotOutcome") ?? "Handoff") as TicketRecord["chatbotOutcome"])
          : null,
      requiredFieldsComplete: booleanValue(
        value(row, mapping, "requiredFieldsComplete"),
        true,
      ),
      categoryAccurate: true,
      workflowCompliant: true,
      crmProfileLinked: booleanValue(
        value(row, mapping, "crmProfileLinked"),
        booleanValue(value(row, mapping, "requiredFieldsComplete"), true),
      ),
      routingMode:
        String(value(row, mapping, "routingMode") ?? "").toLowerCase() === "automated" ||
        channel === "Chatbot"
          ? "Automated"
          : "Manual",
      knowledgeBaseUsed: booleanValue(
        value(row, mapping, "knowledgeBaseUsed"),
        channel === "Chatbot" || category === "Product Question",
      ),
      workflowBypassed: booleanValue(value(row, mapping, "workflowBypassed")),
      escalated: false,
      workflowStage,
      lastActivityAt: createdAt,
    } satisfies TicketRecord];
  });
  return { records, errors };
}

export function toExportRows(records: TicketRecord[]) {
  return records.map((record) => ({
    id: record.id,
    createdAt: record.createdAt,
    team: record.team,
    agent: record.agent,
    channel: record.channel,
    category: record.category,
    segment: record.segment,
    status: record.status,
    firstResponseMinutes: record.firstResponseMinutes ?? "",
    handlingMinutes: record.handlingMinutes ?? "",
    csatScore: record.csatScore ?? "",
    slaTargetMinutes: record.slaTargetMinutes,
    reopened: record.reopened,
    repeatContact: record.repeatContact,
    chatbotOutcome: record.chatbotOutcome ?? "",
    requiredFieldsComplete: record.requiredFieldsComplete,
    crmProfileLinked: record.crmProfileLinked,
    routingMode: record.routingMode,
    knowledgeBaseUsed: record.knowledgeBaseUsed,
    workflowBypassed: record.workflowBypassed,
    categoryAccurate: record.categoryAccurate,
    workflowCompliant: record.workflowCompliant,
    escalated: record.escalated,
    workflowStage: record.workflowStage,
    lastActivityAt: record.lastActivityAt,
    slaMet:
      record.firstResponseMinutes === null
        ? ""
        : record.firstResponseMinutes <= record.slaTargetMinutes,
  }));
}

export const metricDefinitions = [
  { metric: "Ticket volume", definition: "Count of tickets in the selected reporting context.", calculation: "COUNT(Ticket ID)", preferredDirection: "Context only" },
  { metric: "CSAT", definition: "Share of valid survey responses scoring 4 or 5 out of 5.", calculation: "Positive CSAT responses / valid CSAT responses", preferredDirection: "Higher" },
  { metric: "First response", definition: "Average minutes from ticket creation to the first human or automated response.", calculation: "AVERAGE(First response minutes)", preferredDirection: "Lower" },
  { metric: "Handling time", definition: "Average active handling minutes recorded for eligible tickets.", calculation: "AVERAGE(Handling minutes)", preferredDirection: "Lower" },
  { metric: "Resolution rate", definition: "Share of tickets with Resolved status.", calculation: "Resolved tickets / all tickets", preferredDirection: "Higher" },
  { metric: "First-contact resolution", definition: "Share of resolved tickets without reopening or repeat contact.", calculation: "Resolved without reopen or repeat / resolved tickets", preferredDirection: "Higher" },
  { metric: "SLA compliance", definition: "Share of eligible tickets whose first response is within the ticket SLA target.", calculation: "Responses within SLA / SLA-eligible tickets", preferredDirection: "Higher" },
  { metric: "Backlog", definition: "Count of tickets not yet resolved.", calculation: "Open + Pending tickets", preferredDirection: "Lower" },
] as const;

export const reportDataDictionary = [
  ...importFields.map((field) => ({
    field: field.key,
    label: field.label,
    requiredForImport: field.required ? "Yes" : "No",
    description: ({
      id: "Unique ticket identifier.", createdAt: "Ticket creation date in YYYY-MM-DD format.", team: "Business team accountable for the ticket.", agent: "Assigned agent or owner.", channel: "Customer contact channel.", category: "Standardized issue category.", segment: "Customer segment used for comparison.", status: "Current ticket status.", firstResponseMinutes: "Minutes to first response.", handlingMinutes: "Active handling minutes.", csatScore: "Customer satisfaction survey score from 1 to 5.", slaTargetMinutes: "First-response SLA threshold in minutes.", reopened: "Whether the ticket reopened after resolution.", repeatContact: "Whether the customer contacted support again for the same issue.", chatbotOutcome: "Resolved, Fallback, or Handoff outcome for chatbot conversations.", requiredFieldsComplete: "Whether required intake fields were captured.", crmProfileLinked: "Whether the customer CRM profile is linked.", routingMode: "Automated or Manual assignment method.", knowledgeBaseUsed: "Whether approved knowledge content supported the interaction.", workflowBypassed: "Whether the expected service workflow was skipped.",
    } as Record<string, string>)[field.key],
  })),
  { field: "categoryAccurate", label: "Category accurate", requiredForImport: "Derived/demo", description: "Quality-review result for ticket categorization." },
  { field: "workflowCompliant", label: "Workflow compliant", requiredForImport: "Derived/demo", description: "Whether the expected handling workflow was followed." },
  { field: "escalated", label: "Escalated", requiredForImport: "Derived/demo", description: "Whether the ticket required escalation." },
  { field: "workflowStage", label: "Workflow stage", requiredForImport: "Derived", description: "Current operating stage used by Process Health." },
  { field: "lastActivityAt", label: "Last activity date", requiredForImport: "Derived/demo", description: "Most recent ticket activity date." },
  { field: "slaMet", label: "SLA met", requiredForImport: "Derived", description: "Whether first response was within the SLA target." },
] as const;

export function buildPivotSummary(records: TicketRecord[]) {
  const dimensions = [
    { dimension: "Team", values: [...new Set(records.map((record) => record.team))], select: (record: TicketRecord) => record.team },
    { dimension: "Channel", values: [...new Set(records.map((record) => record.channel))], select: (record: TicketRecord) => record.channel },
    { dimension: "Issue category", values: [...new Set(records.map((record) => record.category))], select: (record: TicketRecord) => record.category },
  ];
  return dimensions.flatMap(({ dimension, values, select }) =>
    values.sort().map((value) => {
      const group = records.filter((record) => select(record) === value);
      const kpis = calculateKpis(group);
      return {
        dimension,
        value,
        tickets: kpis.ticketCount,
        csatPercent: kpis.csatPercent,
        firstResponseMinutes: kpis.averageFirstResponseMinutes,
        handlingMinutes: kpis.averageHandlingMinutes,
        resolutionRate: kpis.resolutionRate,
        firstContactResolutionRate: kpis.firstContactResolutionRate,
        slaComplianceRate: kpis.slaComplianceRate,
        backlog: kpis.backlog,
      };
    }),
  );
}

export function buildReportPeriods(
  records: TicketRecord[],
  cadence: "weekly" | "monthly",
) {
  const groups = new Map<string, TicketRecord[]>();
  records.forEach((record) => {
    const date = new Date(`${record.createdAt}T00:00:00Z`);
    let key: string;
    if (cadence === "monthly") {
      key = record.createdAt.slice(0, 7);
    } else {
      const day = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - day + 1);
      key = date.toISOString().slice(0, 10);
    }
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, periodRecords]) => ({
      period,
      records: periodRecords,
      kpis: calculateKpis(periodRecords),
    }));
}
