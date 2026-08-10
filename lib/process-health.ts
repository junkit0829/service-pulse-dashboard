import type {
  TicketRecord,
  WorkflowStage,
} from "./customer-service-data";
import { calculateKpis } from "./kpis.ts";

export type ProcessHealth = {
  records: number;
  requiredFieldCompletionRate: number | null;
  categorizationAccuracyRate: number | null;
  workflowComplianceRate: number | null;
  crmProfileLinkRate: number | null;
  automatedRoutingRate: number | null;
  knowledgeBaseUsageRate: number | null;
  workflowBypassRate: number | null;
  chatbotUsageRate: number | null;
  overallSystemAdoptionScore: number | null;
  slaComplianceRate: number | null;
  escalationRate: number | null;
  reopenRate: number | null;
  stuckTickets: Array<TicketRecord & { inactiveDays: number }>;
  stages: Record<WorkflowStage, number>;
};

export type ProcessRecommendation = {
  type: "Training" | "Workflow" | "System";
  title: string;
  evidence: string;
};

const percent = (part: number, total: number) =>
  total ? (part / total) * 100 : null;

export function analyzeProcessHealth(
  records: TicketRecord[],
  asOfDate: string,
  stuckAfterDays = 2,
): ProcessHealth {
  const asOf = new Date(`${asOfDate}T00:00:00Z`).getTime();
  const stuckTickets = records
    .filter((record) => record.status !== "Resolved")
    .map((record) => ({
      ...record,
      inactiveDays: Math.floor(
        (asOf - new Date(`${record.lastActivityAt}T00:00:00Z`).getTime()) /
          86400000,
      ),
    }))
    .filter((record) => record.inactiveDays > stuckAfterDays)
    .sort((a, b) => b.inactiveDays - a.inactiveDays);
  const kpis = calculateKpis(records);
  const stages: Record<WorkflowStage, number> = {
    Intake: 0,
    "In Progress": 0,
    Waiting: 0,
    Resolved: 0,
  };
  records.forEach((record) => {
    stages[record.workflowStage] += 1;
  });
  const crmProfileLinkRate = percent(
    records.filter((record) => record.crmProfileLinked).length,
    records.length,
  );
  const automatedRoutingRate = percent(
    records.filter((record) => record.routingMode === "Automated").length,
    records.length,
  );
  const knowledgeBaseUsageRate = percent(
    records.filter((record) => record.knowledgeBaseUsed).length,
    records.length,
  );
  const workflowBypassRate = percent(
    records.filter((record) => record.workflowBypassed).length,
    records.length,
  );
  const chatbotUsageRate = percent(
    records.filter((record) => record.channel === "Chatbot").length,
    records.length,
  );
  const overallSystemAdoptionScore = records.length
    ? (crmProfileLinkRate ?? 0) * 0.3 +
      (automatedRoutingRate ?? 0) * 0.25 +
      (knowledgeBaseUsageRate ?? 0) * 0.2 +
      (percent(records.filter((record) => record.requiredFieldsComplete).length, records.length) ?? 0) * 0.15 +
      (100 - (workflowBypassRate ?? 0)) * 0.1
    : null;

  return {
    records: records.length,
    requiredFieldCompletionRate: percent(
      records.filter((record) => record.requiredFieldsComplete).length,
      records.length,
    ),
    categorizationAccuracyRate: percent(
      records.filter((record) => record.categoryAccurate).length,
      records.length,
    ),
    workflowComplianceRate: percent(
      records.filter((record) => record.workflowCompliant).length,
      records.length,
    ),
    crmProfileLinkRate,
    automatedRoutingRate,
    knowledgeBaseUsageRate,
    workflowBypassRate,
    chatbotUsageRate,
    overallSystemAdoptionScore,
    slaComplianceRate: kpis.slaComplianceRate,
    escalationRate: percent(
      records.filter((record) => record.escalated).length,
      records.length,
    ),
    reopenRate: percent(
      records.filter((record) => record.reopened).length,
      records.length,
    ),
    stuckTickets,
    stages,
  };
}

export function recommendProcessActions(
  health: ProcessHealth,
): ProcessRecommendation[] {
  const actions: ProcessRecommendation[] = [];
  if ((health.requiredFieldCompletionRate ?? 100) < 95) {
    actions.push({
      type: "Training",
      title: "Reinforce required-field completion at ticket intake.",
      evidence: `${health.requiredFieldCompletionRate?.toFixed(1)}% completion against a 95% operating target.`,
    });
  }
  if (
    (health.workflowComplianceRate ?? 100) < 95 ||
    health.stuckTickets.length > 0
  ) {
    actions.push({
      type: "Workflow",
      title: "Add aging reviews and ownership checkpoints to active queues.",
      evidence: `${health.stuckTickets.length} tickets are inactive for more than two days; workflow compliance is ${health.workflowComplianceRate?.toFixed(1)}%.`,
    });
  }
  if ((health.categorizationAccuracyRate ?? 100) < 95) {
    actions.push({
      type: "System",
      title: "Add category validation and context-aware field suggestions.",
      evidence: `${health.categorizationAccuracyRate?.toFixed(1)}% categorization accuracy against a 95% target.`,
    });
  }
  if ((health.crmProfileLinkRate ?? 100) < 90) {
    actions.push({
      type: "System",
      title: "Require a linked CRM profile before ticket resolution.",
      evidence: `${health.crmProfileLinkRate?.toFixed(1)}% of selected tickets have a linked customer profile against a 90% adoption target.`,
    });
  }
  if ((health.automatedRoutingRate ?? 100) < 80) {
    actions.push({
      type: "Workflow",
      title: "Expand routing rules for the highest-volume manual queues.",
      evidence: `${health.automatedRoutingRate?.toFixed(1)}% automated routing against an 80% operating target.`,
    });
  }
  if ((health.knowledgeBaseUsageRate ?? 100) < 60) {
    actions.push({
      type: "Training",
      title: "Coach agents to use and improve knowledge articles during resolution.",
      evidence: `${health.knowledgeBaseUsageRate?.toFixed(1)}% knowledge-support usage against a 60% adoption target.`,
    });
  }
  return actions;
}
