import { calculateChatbotMetrics } from "./automation.ts";
import type { TicketRecord } from "./customer-service-data";
import { analyzeIssues, type FollowUpOwner } from "./issues.ts";
import { calculateKpis, formatMetric } from "./kpis.ts";
import { analyzeProcessHealth } from "./process-health.ts";

export type PriorityActionSource = "issues" | "overview" | "automation" | "process";

export type PriorityAction = {
  id: string;
  title: string;
  area: string;
  owner: FollowUpOwner;
  urgency: "Critical" | "High" | "Monitor";
  score: number;
  evidence: string;
  recommendation: string;
  recommendationType: "Rule-based";
  recommendationBasis: string[];
  expectedImpact: string;
  targetOutcome: string;
  records: TicketRecord[];
  sourcePage: PriorityActionSource;
};

const clampScore = (value: number) => Math.max(0, Math.min(100, value));

const urgencyFor = (score: number): PriorityAction["urgency"] =>
  score >= 65 ? "Critical" : score >= 45 ? "High" : "Monitor";

const percent = (part: number, total: number) => (total ? (part / total) * 100 : 0);

function issueActionRule(issue: ReturnType<typeof analyzeIssues>[number]) {
  const { records, kpis, owner, category } = issue;
  const slaBreaches = records.filter(
    (record) =>
      record.firstResponseMinutes !== null &&
      record.firstResponseMinutes > record.slaTargetMinutes,
  ).length;
  const repeatContacts = records.filter(
    (record) => record.repeatContact || record.reopened,
  ).length;
  const escalations = records.filter((record) => record.escalated).length;
  const slaBreachRate = percent(slaBreaches, records.length);
  const repeatRate = percent(repeatContacts, records.length);
  const escalationRate = percent(escalations, records.length);
  const basis = [
    `${formatMetric(kpis.csatPercent, "percent")} CSAT`,
    `${formatMetric(kpis.resolutionRate, "percent")} resolution`,
  ];

  if (owner === "Payment" && escalationRate >= 30 && repeatRate >= 25) {
    return {
      recommendation:
        "Assign one owner to payment exceptions and introduce a same-day review for escalated or repeat-contact cases.",
      basis: [
        ...basis,
        `${escalationRate.toFixed(0)}% escalated`,
        `${repeatRate.toFixed(0)}% reopened or repeat contact`,
      ],
    };
  }
  if (owner === "Payment" && slaBreachRate >= 30) {
    return {
      recommendation:
        "Rebalance payment response ownership and add queue alerts before tickets pass their SLA target.",
      basis: [...basis, `${slaBreachRate.toFixed(0)}% breached response SLA`],
    };
  }
  if (category === "Refund Request" && (kpis.resolutionRate ?? 100) < 80) {
    return {
      recommendation:
        "Publish a refund decision path with clear approval ownership and customer update checkpoints.",
      basis: [...basis, `${records.length - Math.round(records.length * ((kpis.resolutionRate ?? 0) / 100))} unresolved cases`],
    };
  }
  if (owner === "Operations" && repeatRate >= 20) {
    return {
      recommendation:
        "Review the operating handoff and add a completion check for cases generating repeat contact.",
      basis: [...basis, `${repeatRate.toFixed(0)}% reopened or repeat contact`],
    };
  }
  if (owner === "Technology" && slaBreachRate >= 25) {
    return {
      recommendation:
        "Prioritize the recurring failure path and add guided recovery before the response SLA is breached.",
      basis: [...basis, `${slaBreachRate.toFixed(0)}% breached response SLA`],
    };
  }
  if (owner === "Product") {
    return {
      recommendation:
        "Turn repeated product questions into clearer guidance and measure whether repeat contact falls.",
      basis: [...basis, `${records.length} product-question tickets`],
    };
  }
  if ((kpis.resolutionRate ?? 100) < 80) {
    return {
      recommendation:
        "Clarify resolution ownership and review every unresolved case at the next queue checkpoint.",
      basis: [...basis, `${formatMetric(100 - (kpis.resolutionRate ?? 0), "percent")} unresolved`],
    };
  }
  return {
    recommendation:
      "Review the highest-pressure cases and document the next operational improvement with a named owner.",
    basis: [...basis, `${records.length} affected tickets`],
  };
}

export function buildPriorityActions(
  records: TicketRecord[],
  asOfDate?: string,
): PriorityAction[] {
  if (!records.length) return [];

  const kpis = calculateKpis(records);
  const issues = analyzeIssues(records);
  const topIssue = issues[0];
  const latestDate =
    asOfDate ?? [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt;
  const health = analyzeProcessHealth(records, latestDate);
  const chatbot = calculateChatbotMetrics(records);
  const candidates: PriorityAction[] = [];

  if (topIssue) {
    const score = clampScore(topIssue.priorityScore);
    const rule = issueActionRule(topIssue);
    candidates.push({
      id: `issue-${topIssue.category.toLowerCase().replaceAll(" ", "-")}`,
      title: `${topIssue.category} is the highest-impact issue`,
      area: "Customer issue",
      owner: topIssue.owner,
      urgency: urgencyFor(score),
      score,
      evidence: `${topIssue.records.length} tickets recorded ${formatMetric(topIssue.kpis.csatPercent, "percent")} CSAT, ${formatMetric(topIssue.kpis.resolutionRate, "percent")} resolution, and ${formatMetric(topIssue.kpis.averageFirstResponseMinutes, "minutes")} first response.`,
      recommendation: rule.recommendation,
      recommendationType: "Rule-based",
      recommendationBasis: rule.basis,
      expectedImpact: `${topIssue.records.length} customer journeys directly affected`,
      targetOutcome: "Move satisfaction toward 85% and resolution toward 90%",
      records: topIssue.records,
      sourcePage: "issues",
    });
  }

  const slaBreaches = records.filter(
    (record) =>
      record.firstResponseMinutes !== null &&
      record.firstResponseMinutes > record.slaTargetMinutes,
  );
  if (slaBreaches.length) {
    const slaGap = Math.max(0, 90 - (kpis.slaComplianceRate ?? 0));
    const score = clampScore(slaGap * 1.25 + (slaBreaches.length / records.length) * 45);
    candidates.push({
      id: "sla-recovery",
      title: "Response SLA recovery needs an owner",
      area: "Service performance",
      owner: "CX",
      urgency: urgencyFor(score),
      score,
      evidence: `${slaBreaches.length} tickets breached their response target; current SLA compliance is ${formatMetric(kpis.slaComplianceRate, "percent")} against the 90% operating target.`,
      recommendation: "Review breach concentration by channel and introduce a daily queue-aging checkpoint.",
      recommendationType: "Rule-based",
      recommendationBasis: [
        `${slaBreaches.length} SLA breaches`,
        `${formatMetric(kpis.slaComplianceRate, "percent")} current compliance`,
        "90% operating target",
      ],
      expectedImpact: `${slaBreaches.length} response breaches available for recovery`,
      targetOutcome: "Reach at least 90% SLA compliance",
      records: slaBreaches,
      sourcePage: "overview",
    });
  }

  const chatbotExceptions = records.filter(
    (record) =>
      record.channel === "Chatbot" &&
      (record.chatbotOutcome === "Fallback" || record.chatbotOutcome === "Handoff"),
  );
  if (chatbotExceptions.length) {
    const nonContainment = 100 - (chatbot.containmentRate ?? 0);
    const score = clampScore(nonContainment * 0.7 + (chatbotExceptions.length / records.length) * 30);
    candidates.push({
      id: "chatbot-containment",
      title: "Chatbot exceptions are creating avoidable agent work",
      area: "AI & automation",
      owner: "Technology",
      urgency: urgencyFor(score),
      score,
      evidence: `${chatbotExceptions.length} of ${chatbot.conversations} chatbot conversations fell back or required handoff; containment is ${formatMetric(chatbot.containmentRate, "percent")}.`,
      recommendation: "Review the failed intents and improve guidance for the two most repeated exception paths.",
      recommendationType: "Rule-based",
      recommendationBasis: [
        `${chatbotExceptions.length} fallback or handoff outcomes`,
        `${formatMetric(chatbot.containmentRate, "percent")} containment`,
      ],
      expectedImpact: `${chatbotExceptions.length} conversations available for containment improvement`,
      targetOutcome: "Increase containment without increasing repeat contact",
      records: chatbotExceptions,
      sourcePage: "automation",
    });
  }

  const processExceptions = records.filter(
    (record) =>
      !record.requiredFieldsComplete ||
      !record.categoryAccurate ||
      !record.workflowCompliant,
  );
  if (processExceptions.length) {
    const averageGap =
      ((100 - (health.requiredFieldCompletionRate ?? 100)) +
        (100 - (health.categorizationAccuracyRate ?? 100)) +
        (100 - (health.workflowComplianceRate ?? 100))) /
      3;
    const score = clampScore(averageGap * 1.8 + (processExceptions.length / records.length) * 35);
    candidates.push({
      id: "process-adoption",
      title: "Workflow adoption gaps are weakening reporting quality",
      area: "Process health",
      owner: "Operations",
      urgency: urgencyFor(score),
      score,
      evidence: `${processExceptions.length} tickets have a required-field, categorization, or workflow-compliance exception. Required-field completion is ${formatMetric(health.requiredFieldCompletionRate, "percent")}.`,
      recommendation: "Add intake validation and coach the teams with the highest concentration of exceptions.",
      recommendationType: "Rule-based",
      recommendationBasis: [
        `${processExceptions.length} process exceptions`,
        `${formatMetric(health.requiredFieldCompletionRate, "percent")} field completion`,
        `${formatMetric(health.workflowComplianceRate, "percent")} workflow compliance`,
      ],
      expectedImpact: `${processExceptions.length} records can be corrected at source`,
      targetOutcome: "Achieve at least 95% process and data compliance",
      records: processExceptions,
      sourcePage: "process",
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 3);
}
