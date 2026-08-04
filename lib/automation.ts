import type {
  IssueCategory,
  TicketRecord,
} from "./customer-service-data";
import { calculateKpis } from "./kpis.ts";

export const AVOIDED_MANUAL_MINUTES = 12;

export type ChatbotMetrics = {
  conversations: number;
  resolved: number;
  fallback: number;
  handoff: number;
  containmentRate: number | null;
  fallbackRate: number | null;
  handoffRate: number | null;
  ticketsAvoided: number;
  estimatedHoursSaved: number;
};

export type AutomationOpportunity = {
  category: IssueCategory;
  manualTickets: number;
  averageHandlingMinutes: number;
  automationFit: number;
  estimatedAutomatableTickets: number;
  estimatedHoursSaved: number;
  score: number;
  recommendation: string;
};

const percent = (part: number, total: number) =>
  total ? (part / total) * 100 : null;

export function calculateChatbotMetrics(
  records: TicketRecord[],
): ChatbotMetrics {
  const conversations = records.filter(
    (record) => record.channel === "Chatbot" && record.chatbotOutcome,
  );
  const resolved = conversations.filter(
    (record) => record.chatbotOutcome === "Resolved",
  ).length;
  const fallback = conversations.filter(
    (record) => record.chatbotOutcome === "Fallback",
  ).length;
  const handoff = conversations.filter(
    (record) => record.chatbotOutcome === "Handoff",
  ).length;
  return {
    conversations: conversations.length,
    resolved,
    fallback,
    handoff,
    containmentRate: percent(resolved, conversations.length),
    fallbackRate: percent(fallback, conversations.length),
    handoffRate: percent(handoff, conversations.length),
    ticketsAvoided: resolved,
    estimatedHoursSaved: (resolved * AVOIDED_MANUAL_MINUTES) / 60,
  };
}

const automationFit: Record<IssueCategory, number> = {
  "Account Access": 0.75,
  "Delivery Status": 0.65,
  "Payment Failed": 0.55,
  "Refund Request": 0.35,
  "Product Question": 0.85,
};

const recommendations: Record<IssueCategory, string> = {
  "Account Access": "Add guided credential recovery and identity checks.",
  "Delivery Status": "Connect order-status data to a self-service response.",
  "Payment Failed": "Automate failure-code guidance before agent escalation.",
  "Refund Request": "Automate eligibility checks while retaining approval controls.",
  "Product Question": "Expand the knowledge flow for repeat product questions.",
};

export function rankAutomationOpportunities(
  records: TicketRecord[],
): AutomationOpportunity[] {
  const manual = records.filter((record) => record.channel !== "Chatbot");
  const groups = new Map<IssueCategory, TicketRecord[]>();
  manual.forEach((record) => {
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
      const fit = automationFit[category];
      const averageHandlingMinutes = kpis.averageHandlingMinutes ?? 0;
      const estimatedAutomatableTickets = Math.round(
        categoryRecords.length * fit,
      );
      const estimatedHoursSaved =
        (estimatedAutomatableTickets * averageHandlingMinutes) / 60;
      const volumeScore = (categoryRecords.length / maximumVolume) * 100;
      const handlingScore = Math.min(
        100,
        (averageHandlingMinutes / 40) * 100,
      );
      const score = volumeScore * 0.5 + fit * 100 * 0.3 + handlingScore * 0.2;
      return {
        category,
        manualTickets: categoryRecords.length,
        averageHandlingMinutes,
        automationFit: fit,
        estimatedAutomatableTickets,
        estimatedHoursSaved,
        score,
        recommendation: recommendations[category],
      };
    })
    .sort((a, b) => b.score - a.score);
}

