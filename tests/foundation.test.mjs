import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateKpis,
  compareMetric,
  formatMetric,
  meetsTarget,
} from "../lib/kpis.ts";
import {
  filterTickets,
  tickets,
} from "../lib/customer-service-data.ts";
import {
  findLargestContributor,
  groupPerformance,
} from "../lib/performance.ts";
import { analyzeIssues } from "../lib/issues.ts";
import {
  AVOIDED_MANUAL_MINUTES,
  calculateChatbotMetrics,
  projectAutomationScenario,
  rankAutomationOpportunities,
} from "../lib/automation.ts";
import {
  analyzeProcessHealth,
  recommendProcessActions,
} from "../lib/process-health.ts";
import { buildPriorityActions } from "../lib/priority-actions.ts";
import {
  autoMapColumns,
  buildReportPeriods,
  toExportRows,
  validateAndNormalizeRows,
} from "../lib/reporting.ts";

const base = {
  id: "TKT-TEST",
  createdAt: "2026-07-01",
  team: "Customer Service",
  agent: "Test Agent",
  channel: "Email",
  category: "Account Access",
  status: "Resolved",
  firstResponseMinutes: 10,
  handlingMinutes: 20,
  csatScore: 5,
  slaTargetMinutes: 15,
  reopened: false,
  repeatContact: false,
  chatbotOutcome: null,
  requiredFieldsComplete: true,
};

test("calculates the fixed KPI fixture accurately", () => {
  const result = calculateKpis([
    base,
    {
      ...base,
      id: "TKT-TEST-2",
      status: "Open",
      firstResponseMinutes: 20,
      handlingMinutes: 40,
      csatScore: 2,
      reopened: true,
    },
  ]);

  assert.deepEqual(result, {
    ticketCount: 2,
    csatPercent: 50,
    averageFirstResponseMinutes: 15,
    averageHandlingMinutes: 30,
    resolutionRate: 50,
    firstContactResolutionRate: 100,
    slaComplianceRate: 50,
    backlog: 1,
  });
});

test("invalid or incomplete values do not crash calculations", () => {
  const result = calculateKpis([
    {
      ...base,
      firstResponseMinutes: null,
      handlingMinutes: null,
      csatScore: null,
      status: "Pending",
    },
  ]);

  assert.equal(result.averageFirstResponseMinutes, null);
  assert.equal(result.averageHandlingMinutes, null);
  assert.equal(result.csatPercent, null);
  assert.equal(result.backlog, 1);
  assert.equal(formatMetric(null, "percent"), "—");
});

test("shared filters narrow every calculation to the selected records", () => {
  const selected = filterTickets(tickets, {
    startDate: "2026-07-01",
    team: "Payment",
    channel: "Chatbot",
    category: "Payment Failed",
  });

  assert.equal(selected.length, 2);
  assert.ok(selected.every((record) => record.team === "Payment"));
  assert.ok(selected.every((record) => record.channel === "Chatbot"));
  assert.equal(calculateKpis(selected).ticketCount, 2);
});

test("synthetic records cover every job-description data domain", () => {
  assert.deepEqual(
    [...new Set(tickets.map((record) => record.team))].sort(),
    ["Customer Service", "Operations", "Payment"],
  );
  assert.ok(tickets.some((record) => record.chatbotOutcome === "Resolved"));
  assert.ok(tickets.some((record) => record.chatbotOutcome === "Fallback"));
  assert.ok(tickets.some((record) => record.chatbotOutcome === "Handoff"));
  assert.ok(tickets.some((record) => record.crmProfileLinked));
  assert.ok(tickets.some((record) => record.routingMode === "Automated"));
  assert.ok(tickets.some((record) => record.routingMode === "Manual"));
  assert.ok(tickets.some((record) => record.knowledgeBaseUsed));
  assert.ok(tickets.some((record) => record.workflowBypassed));
});

test("priority actions rank traceable cross-functional recommendations", () => {
  const july = tickets.filter((record) => record.createdAt >= "2026-07-01");
  const actions = buildPriorityActions(july);

  assert.equal(actions.length, 3);
  assert.ok(actions.every((action) => action.records.length > 0));
  assert.ok(actions.every((action) => action.owner && action.recommendation));
  assert.ok(actions.every((action) => action.recommendationType === "Rule-based"));
  assert.ok(actions.every((action) => action.recommendationBasis.length >= 2));
  assert.ok(actions.every((action, index) => index === 0 || actions[index - 1].score >= action.score));
  assert.ok(actions.some((action) => action.sourcePage === "issues"));
});

test("payment recommendations change when escalation and repeat contact are elevated", () => {
  const paymentRisk = tickets.filter(
    (record) =>
      record.createdAt >= "2026-07-01" &&
      record.category === "Payment Failed",
  );
  const action = buildPriorityActions(paymentRisk).find((item) => item.sourcePage === "issues");

  assert.ok(action);
  assert.match(action.recommendation, /one owner to payment exceptions/i);
  assert.ok(action.recommendationBasis.some((reason) => reason.includes("escalated")));
  assert.ok(action.recommendationBasis.some((reason) => reason.includes("repeat contact")));
});

test("metric direction correctly interprets positive and negative change", () => {
  assert.deepEqual(compareMetric(85, 80, "higher"), {
    delta: 5,
    isImprovement: true,
  });
  assert.deepEqual(compareMetric(12, 18, "lower"), {
    delta: -6,
    isImprovement: true,
  });
  assert.equal(meetsTarget(85, 80, "higher"), true);
  assert.equal(meetsTarget(18, 15, "lower"), false);
});

test("performance segments reconcile exactly with overview totals", () => {
  for (const dimension of ["team", "agent", "channel", "category", "segment"]) {
    const groups = groupPerformance(tickets, dimension);
    assert.equal(
      groups.reduce((total, group) => total + group.kpis.ticketCount, 0),
      tickets.length,
    );
  }
});

test("largest contributor compares matching groups across periods", () => {
  const current = groupPerformance(
    tickets.filter((record) => record.createdAt >= "2026-07-01"),
    "team",
  );
  const previous = groupPerformance(
    tickets.filter((record) => record.createdAt < "2026-07-01"),
    "team",
  );
  const contributor = findLargestContributor(
    current,
    previous,
    "csatPercent",
  );

  assert.ok(contributor);
  assert.equal(typeof contributor.name, "string");
  assert.equal(typeof contributor.delta, "number");
});

test("issue priority scoring is transparent and repeatable", () => {
  const first = analyzeIssues(tickets);
  const second = analyzeIssues(tickets);

  assert.deepEqual(first, second);
  assert.ok(first.every((issue) => issue.priorityScore >= 0));
  assert.ok(first.every((issue) => issue.priorityScore <= 100));
  assert.deepEqual(
    [...new Set(first.map((issue) => issue.owner))].sort(),
    ["CX", "Operations", "Payment", "Product", "Technology"],
  );
});

test("chatbot outcomes reconcile with eligible conversations", () => {
  const metrics = calculateChatbotMetrics(tickets);
  assert.equal(
    metrics.resolved + metrics.fallback + metrics.handoff,
    metrics.conversations,
  );
  assert.equal(metrics.ticketsAvoided, metrics.resolved);
  assert.equal(
    metrics.estimatedHoursSaved,
    (metrics.resolved * AVOIDED_MANUAL_MINUTES) / 60,
  );
});

test("automation opportunities rank manual workload with visible estimates", () => {
  const opportunities = rankAutomationOpportunities(tickets);
  assert.ok(opportunities.length > 0);
  assert.ok(
    opportunities.every(
      (item) =>
        item.estimatedAutomatableTickets <= item.manualTickets &&
        item.estimatedHoursSaved >= 0,
    ),
  );
  assert.ok(opportunities[0].score >= opportunities.at(-1).score);
});

test("automation scenario projects incremental containment without overstating volume", () => {
  const metrics = calculateChatbotMetrics(tickets);
  const scenario = projectAutomationScenario(metrics, 80, 15);
  assert.ok(scenario.projectedContainedConversations <= metrics.conversations);
  assert.equal(
    scenario.additionalContainedConversations,
    scenario.projectedContainedConversations - metrics.resolved,
  );
  assert.equal(
    scenario.additionalHoursSaved,
    (scenario.additionalContainedConversations * 15) / 60,
  );
  const lowerTarget = projectAutomationScenario(metrics, 0, 15);
  assert.equal(lowerTarget.additionalContainedConversations, 0);
});

test("stuck-ticket detection uses the defined inactivity threshold", () => {
  const health = analyzeProcessHealth(tickets, "2026-07-27", 2);
  assert.ok(
    health.stuckTickets.every(
      (ticket) =>
        ticket.status !== "Resolved" &&
        ticket.inactiveDays > 2,
    ),
  );
  assert.equal(
    Object.values(health.stages).reduce((total, count) => total + count, 0),
    tickets.length,
  );
});

test("process recommendations distinguish training, workflow, and system fixes", () => {
  const actions = recommendProcessActions(
    analyzeProcessHealth(tickets, "2026-07-27", 2),
  );
  assert.deepEqual(
    [...new Set(actions.map((action) => action.type))].sort(),
    ["System", "Training", "Workflow"],
  );
});

test("system adoption metrics reconcile with ticket-level usage fields", () => {
  const health = analyzeProcessHealth(tickets, "2026-07-27", 2);
  const expectedCrm =
    (tickets.filter((record) => record.crmProfileLinked).length / tickets.length) * 100;
  const expectedRouting =
    (tickets.filter((record) => record.routingMode === "Automated").length /
      tickets.length) *
    100;
  const expectedBypass =
    (tickets.filter((record) => record.workflowBypassed).length / tickets.length) *
    100;

  assert.equal(health.crmProfileLinkRate, expectedCrm);
  assert.equal(health.automatedRoutingRate, expectedRouting);
  assert.equal(health.workflowBypassRate, expectedBypass);
  assert.ok((health.overallSystemAdoptionScore ?? -1) >= 0);
  assert.ok((health.overallSystemAdoptionScore ?? 101) <= 100);
});

test("the Excel-compatible template validates and reproduces KPI inputs", () => {
  const rows = toExportRows(tickets);
  const mapping = autoMapColumns(Object.keys(rows[0]));
  const imported = validateAndNormalizeRows(rows, mapping);
  assert.deepEqual(imported.errors, []);
  assert.equal(imported.records.length, tickets.length);
  assert.deepEqual(
    calculateKpis(imported.records),
    calculateKpis(tickets),
  );
});

test("missing required import columns return a useful error", () => {
  const imported = validateAndNormalizeRows([{ id: "TKT-1" }], {
    id: "id",
  });
  assert.equal(imported.records.length, 0);
  assert.match(imported.errors[0], /Map required columns/);
});

test("weekly and monthly reporting groups use calendar periods", () => {
  const weekly = buildReportPeriods(tickets, "weekly");
  const monthly = buildReportPeriods(tickets, "monthly");
  assert.equal(
    weekly.reduce((total, period) => total + period.records.length, 0),
    tickets.length,
  );
  assert.deepEqual(
    monthly.map((period) => period.period),
    ["2026-06", "2026-07"],
  );
});
