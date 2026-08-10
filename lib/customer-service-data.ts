export type Team = "Customer Service" | "Operations" | "Payment";
export type Channel = "Email" | "Live Chat" | "Phone" | "Chatbot";
export type IssueCategory =
  | "Account Access"
  | "Delivery Status"
  | "Payment Failed"
  | "Refund Request"
  | "Product Question";
export type TicketStatus = "Resolved" | "Open" | "Pending";
export type CustomerSegment = "Premium" | "Standard" | "New";
export type WorkflowStage = "Intake" | "In Progress" | "Waiting" | "Resolved";

export type TicketRecord = {
  id: string;
  createdAt: string;
  team: Team;
  agent: string;
  channel: Channel;
  category: IssueCategory;
  segment: CustomerSegment;
  status: TicketStatus;
  firstResponseMinutes: number | null;
  handlingMinutes: number | null;
  csatScore: number | null;
  slaTargetMinutes: number;
  reopened: boolean;
  repeatContact: boolean;
  chatbotOutcome: "Resolved" | "Fallback" | "Handoff" | null;
  requiredFieldsComplete: boolean;
  categoryAccurate: boolean;
  workflowCompliant: boolean;
  crmProfileLinked: boolean;
  routingMode: "Automated" | "Manual";
  knowledgeBaseUsed: boolean;
  workflowBypassed: boolean;
  escalated: boolean;
  workflowStage: WorkflowStage;
  lastActivityAt: string;
};

type Seed = Omit<TicketRecord, "id">;

const seeds: Seed[] = [
  ["2026-06-04", "Customer Service", "Aina", "Email", "Account Access", "Resolved", 38, 18, 5, 60, false, false, null, true],
  ["2026-06-06", "Payment", "Farid", "Live Chat", "Payment Failed", "Resolved", 7, 24, 4, 15, false, false, null, true],
  ["2026-06-09", "Operations", "Mei", "Phone", "Delivery Status", "Resolved", 4, 16, 5, 10, false, false, null, true],
  ["2026-06-11", "Payment", "Daniel", "Email", "Refund Request", "Resolved", 52, 31, 3, 60, true, true, null, true],
  ["2026-06-14", "Customer Service", "Aina", "Chatbot", "Product Question", "Resolved", 0, 3, 5, 1, false, false, "Resolved", true],
  ["2026-06-17", "Customer Service", "Kumar", "Live Chat", "Account Access", "Resolved", 11, 20, 4, 15, false, false, null, true],
  ["2026-06-19", "Operations", "Mei", "Chatbot", "Delivery Status", "Pending", 0, 2, null, 1, false, false, "Handoff", true],
  ["2026-06-22", "Payment", "Farid", "Chatbot", "Payment Failed", "Open", 0, 1, null, 1, false, false, "Fallback", false],
  ["2026-06-25", "Customer Service", "Kumar", "Email", "Product Question", "Resolved", 68, 17, 3, 60, false, true, null, true],
  ["2026-06-28", "Operations", "Sofia", "Phone", "Delivery Status", "Resolved", 8, 22, 4, 10, false, false, null, true],
  ["2026-07-01", "Payment", "Daniel", "Email", "Payment Failed", "Resolved", 74, 35, 2, 60, true, true, null, false],
  ["2026-07-02", "Customer Service", "Aina", "Live Chat", "Account Access", "Resolved", 9, 19, 5, 15, false, false, null, true],
  ["2026-07-03", "Operations", "Sofia", "Phone", "Delivery Status", "Resolved", 6, 14, 4, 10, false, false, null, true],
  ["2026-07-05", "Payment", "Farid", "Chatbot", "Payment Failed", "Pending", 0, 2, null, 1, false, false, "Fallback", false],
  ["2026-07-06", "Customer Service", "Kumar", "Email", "Product Question", "Resolved", 44, 21, 4, 60, false, false, null, true],
  ["2026-07-08", "Payment", "Daniel", "Live Chat", "Refund Request", "Open", 21, 29, 2, 15, false, true, null, true],
  ["2026-07-09", "Operations", "Mei", "Chatbot", "Delivery Status", "Resolved", 0, 2, 5, 1, false, false, "Resolved", true],
  ["2026-07-11", "Customer Service", "Aina", "Phone", "Account Access", "Resolved", 5, 15, 5, 10, false, false, null, true],
  ["2026-07-12", "Payment", "Farid", "Email", "Payment Failed", "Resolved", 83, 38, 2, 60, true, true, null, false],
  ["2026-07-14", "Operations", "Sofia", "Live Chat", "Delivery Status", "Resolved", 13, 25, 3, 15, false, false, null, true],
  ["2026-07-15", "Customer Service", "Kumar", "Chatbot", "Product Question", "Resolved", 0, 3, 4, 1, false, false, "Resolved", true],
  ["2026-07-17", "Payment", "Daniel", "Chatbot", "Refund Request", "Pending", 0, 1, null, 1, false, false, "Handoff", true],
  ["2026-07-18", "Customer Service", "Aina", "Email", "Account Access", "Resolved", 57, 22, 4, 60, false, false, null, true],
  ["2026-07-20", "Operations", "Mei", "Phone", "Delivery Status", "Open", 12, 27, 3, 10, false, true, null, false],
  ["2026-07-21", "Payment", "Farid", "Live Chat", "Payment Failed", "Resolved", 18, 32, 3, 15, false, false, null, true],
  ["2026-07-22", "Customer Service", "Kumar", "Chatbot", "Product Question", "Open", 0, 1, null, 1, false, false, "Fallback", true],
  ["2026-07-23", "Payment", "Daniel", "Email", "Refund Request", "Resolved", 66, 34, 2, 60, true, true, null, false],
  ["2026-07-24", "Operations", "Sofia", "Live Chat", "Delivery Status", "Resolved", 10, 18, 4, 15, false, false, null, true],
  ["2026-07-25", "Customer Service", "Aina", "Email", "Account Access", "Pending", null, null, null, 60, false, false, null, true],
  ["2026-07-26", "Payment", "Farid", "Chatbot", "Payment Failed", "Resolved", 0, 2, 4, 1, false, false, "Resolved", true],
].map((values, index) => ({
  createdAt: values[0] as string,
  team: values[1] as Team,
  agent: values[2] as string,
  channel: values[3] as Channel,
  category: values[4] as IssueCategory,
  segment: (["Premium", "Standard", "New"] as CustomerSegment[])[index % 3],
  status: values[5] as TicketStatus,
  firstResponseMinutes: values[6] as number | null,
  handlingMinutes: values[7] as number | null,
  csatScore: values[8] as number | null,
  slaTargetMinutes: values[9] as number,
  reopened: values[10] as boolean,
  repeatContact: values[11] as boolean,
  chatbotOutcome: values[12] as TicketRecord["chatbotOutcome"],
  requiredFieldsComplete: values[13] as boolean,
  categoryAccurate: index % 7 !== 0,
  workflowCompliant: index % 6 !== 0,
  crmProfileLinked: index % 5 !== 0,
  routingMode: values[3] === "Chatbot" || index % 4 !== 0 ? "Automated" : "Manual",
  knowledgeBaseUsed:
    values[3] === "Chatbot" || values[4] === "Product Question" || index % 3 === 0,
  workflowBypassed: index % 8 === 0,
  escalated: Boolean(values[10] || values[11] || index % 9 === 0),
  workflowStage:
    values[5] === "Resolved"
      ? "Resolved"
      : values[5] === "Pending"
        ? "Waiting"
        : index % 2 === 0
          ? "In Progress"
          : "Intake",
  lastActivityAt: values[0] as string,
}));

export const tickets: TicketRecord[] = seeds.map((seed, index) => ({
  id: `TKT-${String(index + 1001).padStart(4, "0")}`,
  ...seed,
}));

export const filterOptions = {
  teams: [...new Set(tickets.map((ticket) => ticket.team))],
  channels: [...new Set(tickets.map((ticket) => ticket.channel))],
  categories: [...new Set(tickets.map((ticket) => ticket.category))],
};

export type TicketFilters = {
  startDate: string;
  endDate?: string;
  team: "All" | Team;
  channel: "All" | Channel;
  category: "All" | IssueCategory;
};

export function filterTickets(
  records: TicketRecord[],
  filters: TicketFilters,
) {
  return records.filter(
    (ticket) =>
      ticket.createdAt >= filters.startDate &&
      (!filters.endDate || ticket.createdAt <= filters.endDate) &&
      (filters.team === "All" || ticket.team === filters.team) &&
      (filters.channel === "All" || ticket.channel === filters.channel) &&
      (filters.category === "All" || ticket.category === filters.category),
  );
}
