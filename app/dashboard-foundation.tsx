"use client";

import { useEffect, useMemo, useState } from "react";
import {
  filterTickets,
  tickets,
  type Channel,
  type IssueCategory,
  type Team,
  type TicketRecord,
} from "../lib/customer-service-data";
import {
  calculateKpis,
  compareMetric,
  formatMetric,
  meetsTarget,
  type KpiSummary,
  type MetricDirection,
} from "../lib/kpis";
import {
  findLargestContributor,
  groupPerformance,
  metricValue,
  type PerformanceDimension,
  type PerformanceMetric,
} from "../lib/performance";
import { analyzeIssues, type IssueAnalysis } from "../lib/issues";
import {
  AVOIDED_MANUAL_MINUTES,
  calculateChatbotMetrics,
  projectAutomationScenario,
  rankAutomationOpportunities,
} from "../lib/automation";
import {
  analyzeProcessHealth,
  recommendProcessActions,
} from "../lib/process-health";
import {
  buildPriorityActions,
} from "../lib/priority-actions";
import {
  autoMapColumns,
  buildPivotSummary,
  buildReportPeriods,
  importFields,
  metricDefinitions,
  reportDataDictionary,
  toExportRows,
  validateAndNormalizeRows,
  type ColumnMapping,
} from "../lib/reporting";

type PageKey =
  | "priority"
  | "foundation"
  | "overview"
  | "analysis"
  | "issues"
  | "automation"
  | "process"
  | "reports";

const navigation: { key: PageKey; label: string; phase: number; glyph: string }[] =
  [
    { key: "priority", label: "Priority actions", phase: 0, glyph: "!" },
    { key: "foundation", label: "Data foundation", phase: 1, glyph: "D" },
    { key: "overview", label: "KPI overview", phase: 2, glyph: "K" },
    { key: "analysis", label: "Performance", phase: 3, glyph: "P" },
    { key: "issues", label: "Customer issues", phase: 4, glyph: "C" },
    { key: "automation", label: "AI & automation", phase: 5, glyph: "A" },
    { key: "process", label: "Process health", phase: 6, glyph: "S" },
    { key: "reports", label: "Reports", phase: 7, glyph: "R" },
  ];

type DateKey = "all" | "july" | "recent" | "custom";
const storageKey = "service-pulse-imported-dataset-v1";
type StoredDataset = {
  records: TicketRecord[];
  sourceName: string;
  savedAt: string;
};

const loadStoredDataset = (): StoredDataset | null => {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "null") as StoredDataset | null;
    return parsed && Array.isArray(parsed.records) && parsed.records.length ? parsed : null;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
};

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const rangeLength = (start: string, end: string) =>
  Math.max(
    1,
    Math.round(
      (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        86400000,
    ) + 1,
  );

export function DashboardFoundation() {
  const [page, setPage] = useState<PageKey>("priority");
  const [activeTickets, setActiveTickets] = useState<TicketRecord[]>(tickets);
  const [date, setDate] = useState<DateKey>("july");
  const [customStart, setCustomStart] = useState("2026-07-01");
  const [customEnd, setCustomEnd] = useState("2026-07-31");
  const [team, setTeam] = useState<"All" | Team>("All");
  const [channel, setChannel] = useState<"All" | Channel>("All");
  const [category, setCategory] = useState<"All" | IssueCategory>("All");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sourceName, setSourceName] = useState("Synthetic demonstration data");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<{ title: string; records: TicketRecord[] } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = loadStoredDataset();
      if (!stored) return;
      setActiveTickets(stored.records);
      setSourceName(stored.sourceName);
      setLastUpdated(stored.savedAt);
      setDate("all");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const datasetRange = useMemo(() => {
    const sortedDates = activeTickets.map((record) => record.createdAt).sort();
    return {
      start: sortedDates[0] ?? "2026-01-01",
      end: sortedDates[sortedDates.length - 1] ?? "2026-07-31",
    };
  }, [activeTickets]);

  const selectedRange = useMemo(() => {
    if (date === "all") {
      return { ...datasetRange, label: "All available data" };
    }
    if (date === "july") {
      return {
        start: "2026-07-01",
        end: datasetRange.end < "2026-07-31" ? datasetRange.end : "2026-07-31",
        label: "July 2026",
      };
    }
    if (date === "recent") {
      return {
        start: shiftDate(datasetRange.end, -13),
        end: datasetRange.end,
        label: "Latest 14 days",
      };
    }
    return {
      start: customStart,
      end: customEnd,
      label: `${customStart} to ${customEnd}`,
    };
  }, [date, datasetRange, customStart, customEnd]);

  const filtered = useMemo(
    () =>
      filterTickets(activeTickets, {
        startDate: selectedRange.start,
        endDate: selectedRange.end,
        team,
        channel,
        category,
      }),
    [activeTickets, selectedRange, team, channel, category],
  );
  const kpis = useMemo(() => calculateKpis(filtered), [filtered]);
  const previous = useMemo(() => {
    if (date === "all") return [];
    const days = rangeLength(selectedRange.start, selectedRange.end);
    return filterTickets(activeTickets, {
      startDate: shiftDate(selectedRange.start, -days),
      endDate: shiftDate(selectedRange.start, -1),
      team,
      channel,
      category,
    });
  }, [activeTickets, date, selectedRange, team, channel, category]);
  const previousKpis = useMemo(() => calculateKpis(previous), [previous]);

  const resetFilters = () => {
    setDate("july");
    setTeam("All");
    setChannel("All");
    setCategory("All");
  };

  const activeFilterSummary = [
    selectedRange.label,
    team === "All" ? "All teams" : team,
    channel === "All" ? "All channels" : channel,
    category === "All" ? "All categories" : category,
    `${filtered.length} tickets`,
  ].join(" · ");

  const importRecords = (records: TicketRecord[], name: string) => {
    const savedAt = new Date().toISOString();
    setActiveTickets(records);
    setSourceName(name);
    setLastUpdated(savedAt);
    setDate("all");
    localStorage.setItem(
      storageKey,
      JSON.stringify({ records, sourceName: name, savedAt }),
    );
  };

  const restoreDemoData = () => {
    setActiveTickets(tickets);
    setSourceName("Synthetic demonstration data");
    setLastUpdated(null);
    setDate("july");
    localStorage.removeItem(storageKey);
  };

  const openDrilldown = (metric: keyof KpiSummary) => {
    const definitions: Record<keyof KpiSummary, { title: string; test: (record: TicketRecord) => boolean }> = {
      ticketCount: { title: "Tickets in the current selection", test: () => true },
      csatPercent: { title: "Tickets with customer satisfaction responses", test: (record) => record.csatScore !== null },
      averageFirstResponseMinutes: { title: "Tickets included in first-response time", test: (record) => record.firstResponseMinutes !== null },
      averageHandlingMinutes: { title: "Tickets included in handling time", test: (record) => record.handlingMinutes !== null },
      resolutionRate: { title: "Unresolved tickets affecting resolution rate", test: (record) => record.status !== "Resolved" },
      backlog: { title: "Open and pending backlog", test: (record) => record.status !== "Resolved" },
      slaComplianceRate: { title: "Tickets breaching their response SLA", test: (record) => record.firstResponseMinutes !== null && record.firstResponseMinutes > record.slaTargetMinutes },
      firstContactResolutionRate: { title: "Reopened or repeat-contact tickets", test: (record) => record.reopened || record.repeatContact },
    };
    const definition = definitions[metric];
    setDrilldown({ title: definition.title, records: filtered.filter(definition.test) });
  };

  const availableOptions = useMemo(() => ({
    teams: [...new Set(activeTickets.map((ticket) => ticket.team))],
    channels: [...new Set(activeTickets.map((ticket) => ticket.channel))],
    categories: [...new Set(activeTickets.map((ticket) => ticket.category))],
  }), [activeTickets]);

  const current = navigation.find((item) => item.key === page) ?? navigation[0];

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "is-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">CX</span>
          <span>
            <strong>Service Pulse</strong>
            <small>Performance intelligence</small>
          </span>
        </div>

        <nav aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {navigation.map((item) => (
            <button
              className={`nav-item ${page === item.key ? "active" : ""}`}
              key={item.key}
              onClick={() => {
                setPage(item.key);
                setMobileNavOpen(false);
              }}
              aria-current={page === item.key ? "page" : undefined}
            >
              <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button
            className="menu-button"
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            ☰
          </button>
          <div>
            <p className="eyebrow">Customer experience operations</p>
            <h1>{current.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className={`demo-badge ${lastUpdated ? "imported" : ""}`}>
              <span /> {lastUpdated ? "Imported data" : "Synthetic demo data"}
              {lastUpdated && <small>Updated {new Date(lastUpdated).toLocaleString("en-MY")}</small>}
            </div>
          </div>
        </header>

        <div className="content">
          <section className="filter-panel" aria-label="Shared data filters">
            <div className="filter-heading">
              <div>
                <p className="eyebrow">Shared filter context</p>
                <strong>{filtered.length} of {activeTickets.length} records selected</strong>
              </div>
              <button className="reset-button" onClick={resetFilters}>Reset filters</button>
            </div>
            <div className="filter-grid">
              <Filter label="Period" value={date} onChange={(value) => setDate(value as DateKey)}>
                <option value="all">All available data</option>
                <option value="july">July 2026</option>
                <option value="recent">Latest 14 days</option>
                <option value="custom">Custom date range</option>
              </Filter>
              <Filter label="Team" value={team} onChange={(value) => setTeam(value as typeof team)}>
                <option>All</option>
                {availableOptions.teams.map((value) => <option key={value}>{value}</option>)}
              </Filter>
              <Filter label="Channel" value={channel} onChange={(value) => setChannel(value as typeof channel)}>
                <option>All</option>
                {availableOptions.channels.map((value) => <option key={value}>{value}</option>)}
              </Filter>
              <Filter label="Issue category" value={category} onChange={(value) => setCategory(value as typeof category)}>
                <option>All</option>
                {availableOptions.categories.map((value) => <option key={value}>{value}</option>)}
              </Filter>
            </div>
            {date === "custom" && (
              <div className="custom-date-range">
                <label><span>Start date</span><input type="date" min={datasetRange.start} max={customEnd} value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
                <label><span>End date</span><input type="date" min={customStart} max={datasetRange.end} value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
              </div>
            )}
            <div className="active-filter-bar" aria-label="Active filters">
              <span>{activeFilterSummary}</span>
              {date !== "july" && <button onClick={() => setDate("july")}>Period ×</button>}
              {team !== "All" && <button onClick={() => setTeam("All")}>{team} ×</button>}
              {channel !== "All" && <button onClick={() => setChannel("All")}>{channel} ×</button>}
              {category !== "All" && <button onClick={() => setCategory("All")}>{category} ×</button>}
            </div>
          </section>

          {page === "priority" ? (
            <PriorityActionsPage
              records={filtered}
              periodLabel={selectedRange.label}
              onOpenRecords={(title, records) => setDrilldown({ title, records })}
              onNavigate={setPage}
            />
          ) : page === "foundation" ? (
            <FoundationContent filteredCount={filtered.length} kpis={kpis} />
          ) : page === "overview" ? (
            <OverviewContent
              records={filtered}
              kpis={kpis}
              previousKpis={previous.length ? previousKpis : null}
              periodLabel={selectedRange.label}
              onDrilldown={openDrilldown}
            />
          ) : page === "analysis" ? (
            <PerformanceAnalysis
              records={filtered}
              previousRecords={previous}
              periodLabel={selectedRange.label}
            />
          ) : page === "issues" ? (
            <CustomerIssues
              records={filtered}
              previousRecords={previous}
              periodLabel={selectedRange.label}
            />
          ) : page === "automation" ? (
            <AIAndAutomation
              records={filtered}
              periodLabel={selectedRange.label}
            />
          ) : page === "process" ? (
            <ProcessHealthPage
              records={filtered}
              periodLabel={selectedRange.label}
            />
          ) : page === "reports" ? (
            <ReportsAndExcel
              records={filtered}
              allRecords={activeTickets}
              onImport={importRecords}
              onReset={restoreDemoData}
              periodLabel={selectedRange.label}
              filterSummary={activeFilterSummary}
              sourceName={sourceName}
              lastUpdated={lastUpdated}
            />
          ) : (
            <UpcomingPage item={current} />
          )}
        </div>
      </section>
      {drilldown && <TicketDrilldown {...drilldown} onClose={() => setDrilldown(null)} />}
    </main>
  );
}

type ActionStatus = "Proposed" | "In progress" | "Completed";

function PriorityActionsPage({
  records,
  periodLabel,
  onOpenRecords,
  onNavigate,
}: {
  records: TicketRecord[];
  periodLabel: string;
  onOpenRecords: (title: string, records: TicketRecord[]) => void;
  onNavigate: (page: PageKey) => void;
}) {
  const actions = useMemo(() => buildPriorityActions(records), [records]);
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});
  const affectedTickets = new Set(actions.flatMap((action) => action.records.map((record) => record.id))).size;
  const criticalActions = actions.filter((action) => action.urgency === "Critical").length;
  const owners = new Set(actions.map((action) => action.owner)).size;

  if (!records.length) {
    return (
      <section className="empty-state priority-empty">
        <span>✓</span>
        <h2>No priority actions for this selection</h2>
        <p>Expand the period or remove a filter to generate a ranked action summary.</p>
      </section>
    );
  }

  return (
    <>
      <section className="priority-hero">
        <div>
          <p className="eyebrow">Decision brief · {periodLabel}</p>
          <h2>Turn the strongest signals into accountable action.</h2>
          <p>
            Service Pulse combines customer impact, operating gaps, and affected
            volume to rank the next actions for CX, Operations, Payment, Product,
            and Technology teams.
          </p>
        </div>
        <div className="priority-hero-score" aria-label={`${actions.length} ranked actions`}>
          <span>Actions ranked</span>
          <strong>{actions.length}</strong>
          <small>Recalculates with every filter</small>
        </div>
      </section>

      <section className="priority-summary-grid" aria-label="Priority action summary">
        <article>
          <span className="priority-summary-icon risk">!</span>
          <div><small>Critical actions</small><strong>{criticalActions}</strong><p>Immediate management attention</p></div>
        </article>
        <article>
          <span className="priority-summary-icon tickets">#</span>
          <div><small>Tickets exposed</small><strong>{affectedTickets}</strong><p>Unique records behind the actions</p></div>
        </article>
        <article>
          <span className="priority-summary-icon owners">◎</span>
          <div><small>Teams accountable</small><strong>{owners}</strong><p>Named cross-functional owners</p></div>
        </article>
        <article>
          <span className="priority-summary-icon refresh">↻</span>
          <div><small>Review cadence</small><strong>Weekly</strong><p>Recheck movement after action</p></div>
        </article>
      </section>

      <section className="priority-actions-section">
        <div className="section-title priority-section-title">
          <div>
            <p className="eyebrow">Ranked action register</p>
            <h2>What needs attention first</h2>
          </div>
          <p>Priority score combines scale and business impact. Higher is more urgent.</p>
        </div>

        <div className="priority-action-list">
          {actions.map((action, index) => {
            const status = statuses[action.id] ?? "Proposed";
            return (
              <article className={`priority-action-card ${action.urgency.toLowerCase()}`} key={action.id}>
                <div className="priority-rank" aria-label={`Rank ${index + 1}`}>
                  <span>0{index + 1}</span>
                  <div className="priority-score-ring" style={{ "--score": `${action.score}%` } as React.CSSProperties}>
                    <strong>{Math.round(action.score)}</strong>
                    <small>score</small>
                  </div>
                </div>

                <div className="priority-action-body">
                  <div className="priority-action-heading">
                    <div>
                      <div className="priority-action-tags">
                        <span className={`priority-pill ${action.urgency.toLowerCase()}`}>{action.urgency}</span>
                        <span>{action.area}</span>
                      </div>
                      <h3>{action.title}</h3>
                    </div>
                    <label className="action-status-control">
                      <span>Status</span>
                      <select
                        value={status}
                        onChange={(event) =>
                          setStatuses((current) => ({
                            ...current,
                            [action.id]: event.target.value as ActionStatus,
                          }))
                        }
                        aria-label={`Status for ${action.title}`}
                      >
                        <option>Proposed</option>
                        <option>In progress</option>
                        <option>Completed</option>
                      </select>
                    </label>
                  </div>

                  <p className="priority-evidence">{action.evidence}</p>

                  <div className="recommendation-basis" aria-label={`Why ${action.title} was recommended`}>
                    <span className="recommendation-type">{action.recommendationType} recommendation</span>
                    <span className="basis-label">Triggered by</span>
                    {action.recommendationBasis.map((reason) => (
                      <span className="basis-chip" key={reason}>{reason}</span>
                    ))}
                  </div>

                  <div className="priority-action-detail-grid">
                    <div><span>Recommended action · rule-based</span><strong>{action.recommendation}</strong></div>
                    <div><span>Accountable owner</span><strong>{action.owner}</strong></div>
                    <div><span>Expected reach</span><strong>{action.expectedImpact}</strong></div>
                    <div><span>Success measure</span><strong>{action.targetOutcome}</strong></div>
                  </div>

                  <div className="priority-action-footer">
                    <button
                      className="primary-action-button"
                      onClick={() => onOpenRecords(`${action.title} · supporting tickets`, action.records)}
                    >
                      Review {action.records.length} supporting tickets
                    </button>
                    <button className="secondary-action-button" onClick={() => onNavigate(action.sourcePage)}>
                      Open detailed analysis →
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="priority-method-note">
        <div className="priority-method-mark">i</div>
        <div>
          <p className="eyebrow">Transparent prioritization</p>
          <h2>Every action remains traceable to the selected records.</h2>
          <p>Scores are recalculated when the period, team, channel, or issue category changes. Use the supporting-ticket view to validate the evidence before assigning work.</p>
        </div>
      </section>
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function FoundationContent({
  filteredCount,
  kpis,
}: {
  filteredCount: number;
  kpis: ReturnType<typeof calculateKpis>;
}) {
  const metrics = [
    ["Ticket records", formatMetric(kpis.ticketCount, "number"), "Count of valid records"],
    ["CSAT", formatMetric(kpis.csatPercent, "percent"), "Scores of 4–5 are positive"],
    ["First response", formatMetric(kpis.averageFirstResponseMinutes, "minutes"), "Mean of valid response times"],
    ["Handling time", formatMetric(kpis.averageHandlingMinutes, "minutes"), "Mean of valid handling times"],
    ["Resolution rate", formatMetric(kpis.resolutionRate, "percent"), "Resolved ÷ eligible tickets"],
    ["SLA compliance", formatMetric(kpis.slaComplianceRate, "percent"), "Responses within channel target"],
    ["Backlog", formatMetric(kpis.backlog, "number"), "Open + pending tickets"],
    ["First-contact resolution", formatMetric(kpis.firstContactResolutionRate, "percent"), "No reopen or repeat contact"],
  ];

  return (
    <>
      {filteredCount === 0 ? (
        <section className="empty-state">
          <span aria-hidden="true">0</span>
          <h2>No matching records</h2>
          <p>Adjust the shared filters to restore a valid data selection.</p>
        </section>
      ) : (
        <>
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Phase 1 · Calculation preview</p>
              <h2>One reliable source for every decision.</h2>
              <p>
                The filter context below feeds the same validated records into
                every metric. Charts arrive in Phase 2, after this calculation
                layer passes its quality gate.
              </p>
            </div>
            <div className="quality-score">
              <span>Data readiness</span>
              <strong>96.7%</strong>
              <small>29 of 30 records complete</small>
            </div>
          </section>

          <section className="metric-preview" aria-labelledby="metric-preview-title">
            <div className="section-title">
              <div>
                <p className="eyebrow">Live calculation check</p>
                <h2 id="metric-preview-title">Verified metric outputs</h2>
              </div>
              <span className="phase-chip">Foundation preview</span>
            </div>
            <div className="metric-grid">
              {metrics.map(([label, value, note]) => (
                <article className="metric-card" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{note}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="foundation-grid">
            <article className="schema-card">
              <div className="section-title compact">
                <div>
                  <p className="eyebrow">Excel-ready schema</p>
                  <h2>Four data domains connected</h2>
                </div>
                <span className="success-chip">Ready</span>
              </div>
              <div className="domain-list">
                {[
                  ["CS", "Customer Service", "Tickets, agents, response and resolution"],
                  ["OP", "Operations", "Delivery issues and workflow ownership"],
                  ["PY", "Payment", "Failures, refunds and escalation patterns"],
                  ["AI", "Chatbot", "Resolution, fallback and handoff outcomes"],
                ].map(([code, title, detail]) => (
                  <div className="domain-row" key={code}>
                    <span>{code}</span>
                    <div><strong>{title}</strong><small>{detail}</small></div>
                    <b aria-label="Included">✓</b>
                  </div>
                ))}
              </div>
            </article>

            <article className="validation-card">
              <div className="section-title compact">
                <div>
                  <p className="eyebrow">Quality controls</p>
                  <h2>Validation status</h2>
                </div>
              </div>
              <div className="validation-list">
                <div><span>Required identifiers</span><strong>30 / 30</strong></div>
                <div><span>Valid date values</span><strong>30 / 30</strong></div>
                <div><span>Complete classifications</span><strong>30 / 30</strong></div>
                <div><span>Invalid records blocked</span><strong>Safe</strong></div>
              </div>
              <p className="validation-note">
                One pending ticket has no response or handling values yet. It is
                retained to verify that incomplete operational fields do not
                break calculations.
              </p>
            </article>
          </section>
        </>
      )}
    </>
  );
}

type MetricCardConfig = {
  key: keyof KpiSummary;
  label: string;
  type: "number" | "percent" | "minutes";
  target: number;
  targetLabel: string;
  direction: MetricDirection;
};

const overviewMetrics: MetricCardConfig[] = [
  { key: "csatPercent", label: "CSAT", type: "percent", target: 85, targetLabel: "≥ 85%", direction: "higher" },
  { key: "averageFirstResponseMinutes", label: "First response", type: "minutes", target: 20, targetLabel: "≤ 20 min", direction: "lower" },
  { key: "averageHandlingMinutes", label: "Handling time", type: "minutes", target: 25, targetLabel: "≤ 25 min", direction: "lower" },
  { key: "resolutionRate", label: "Resolution rate", type: "percent", target: 85, targetLabel: "≥ 85%", direction: "higher" },
  { key: "ticketCount", label: "Ticket volume", type: "number", target: 20, targetLabel: "Capacity 20", direction: "lower" },
  { key: "backlog", label: "Backlog", type: "number", target: 3, targetLabel: "≤ 3 tickets", direction: "lower" },
  { key: "slaComplianceRate", label: "SLA compliance", type: "percent", target: 90, targetLabel: "≥ 90%", direction: "higher" },
];

function metricDefinition(metric: keyof KpiSummary) {
  const definitions: Record<keyof KpiSummary, string> = {
    ticketCount: "All valid tickets inside the active filters.",
    csatPercent: "The share of received CSAT scores rated 4 or 5.",
    averageFirstResponseMinutes: "Mean minutes until the first agent or automated response.",
    averageHandlingMinutes: "Mean active handling time for tickets with a recorded value.",
    resolutionRate: "Resolved tickets divided by all selected tickets.",
    backlog: "Tickets currently marked Open or Pending.",
    slaComplianceRate: "Responses completed within each ticket’s channel SLA target.",
    firstContactResolutionRate: "Resolved without reopening or repeat contact.",
  };
  return definitions[metric];
}

function MetricInfo({ text }: { text: string }) {
  return (
    <i
      className="metric-info tooltip-bar"
      data-tooltip={text}
      tabIndex={0}
      aria-label={text}
      onClick={(event) => event.stopPropagation()}
    >?</i>
  );
}

function OverviewContent({
  records,
  kpis,
  previousKpis,
  periodLabel,
  onDrilldown,
}: {
  records: TicketRecord[];
  kpis: KpiSummary;
  previousKpis: KpiSummary | null;
  periodLabel: string;
  onDrilldown: (metric: keyof KpiSummary) => void;
}) {
  if (!records.length) {
    return (
      <section className="empty-state">
        <span aria-hidden="true">0</span>
        <h2>No KPI data available</h2>
        <p>Adjust the shared filters to restore a valid reporting selection.</p>
      </section>
    );
  }

  const trends = buildWeeklyTrends(records);
  const alerts = buildAlerts(kpis);
  const insight = buildInsight(records, kpis);
  const onTarget = overviewMetrics.filter((metric) =>
    meetsTarget(kpis[metric.key], metric.target, metric.direction),
  ).length;

  return (
    <>
      <section className="overview-heading">
        <div>
          <p className="eyebrow">Executive pulse · {periodLabel}</p>
          <h2>Service performance at a glance</h2>
          <p>Targets, movement, and operational risk in one shared view.</p>
        </div>
        <div className="target-summary">
          <strong>{onTarget}/{overviewMetrics.length}</strong>
          <span>KPIs on target</span>
        </div>
      </section>

      <section className="executive-metrics" aria-label="Executive KPI summary">
        {overviewMetrics.map((metric) => {
          const value = kpis[metric.key];
          const previousValue = previousKpis?.[metric.key] ?? null;
          const comparison = compareMetric(
            value,
            previousValue,
            metric.direction,
          );
          const targetMet = meetsTarget(value, metric.target, metric.direction);
          const deltaText =
            comparison.delta === null
              ? "No prior period"
              : `${comparison.delta > 0 ? "+" : ""}${metric.type === "number" ? comparison.delta.toFixed(0) : comparison.delta.toFixed(1)}${metric.type === "percent" ? " pts" : metric.type === "minutes" ? " min" : ""}`;

          return (
            <button
              type="button"
              className={`executive-card ${targetMet ? "on-target" : "off-target"}`}
              key={metric.key}
              onClick={() => onDrilldown(metric.key)}
              aria-label={`Open ${metric.label} ticket details`}
            >
              <div className="executive-card-top">
                <span>{metric.label} <MetricInfo text={metricDefinition(metric.key)} /></span>
                <b className={targetMet ? "target-good" : "target-risk"}>
                  {targetMet ? "On target" : "Needs attention"}
                </b>
              </div>
              <strong>{formatMetric(value, metric.type)}</strong>
              <MiniTrend
                label={metric.label}
                values={trends.map((item) => item.summary[metric.key])}
                periods={trends.map((item) => item.label)}
                target={metric.target}
                type={metric.type}
                targetMet={Boolean(targetMet)}
              />
              <div className="metric-comparison">
                <span
                  className={
                    comparison.isImprovement === null
                      ? "neutral"
                      : comparison.isImprovement
                        ? "improved"
                        : "declined"
                  }
                >
                  {comparison.isImprovement === true
                    ? "↗"
                    : comparison.isImprovement === false
                      ? "↘"
                      : "–"}{" "}
                  {deltaText}
                </span>
                <small>vs previous</small>
              </div>
              <div className="target-line">
                <span>Target</span>
                <b>{metric.targetLabel} · View tickets →</b>
              </div>
            </button>
          );
        })}
      </section>

      <section className="overview-grid">
        <article className="trend-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Performance trend</p>
              <h2>CSAT and SLA by week</h2>
            </div>
            <div className="chart-legend" aria-label="Chart legend">
              <span><i className="legend-csat" /> CSAT</span>
              <span><i className="legend-sla" /> SLA</span>
            </div>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={`Weekly CSAT and SLA compliance. ${trends.map((item) => `${item.label}: CSAT ${formatMetric(item.csat, "percent")}, SLA ${formatMetric(item.sla, "percent")}`).join(". ")}`}
          >
            <div className="chart-scale" aria-hidden="true">
              <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
            </div>
            <div className="chart-plots">
              {trends.map((item) => (
                <div className="bar-group" key={item.label}>
                  <div className="bars">
                    <span
                      className="bar csat-bar tooltip-bar"
                      style={{ height: `${item.csat ?? 0}%` }}
                      data-tooltip={`${item.label} · CSAT ${formatMetric(item.csat, "percent")}`}
                      tabIndex={0}
                      aria-label={`${item.label}, CSAT ${formatMetric(item.csat, "percent")}`}
                    />
                    <span
                      className="bar sla-bar tooltip-bar"
                      style={{ height: `${item.sla ?? 0}%` }}
                      data-tooltip={`${item.label} · SLA ${formatMetric(item.sla, "percent")}`}
                      tabIndex={0}
                      aria-label={`${item.label}, SLA ${formatMetric(item.sla, "percent")}`}
                    />
                  </div>
                  <b>{item.label}</b>
                  <small>{item.volume} tickets</small>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="alerts-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Performance alerts</p>
              <h2>{alerts.length} items to review</h2>
            </div>
            <span className="alert-count">{alerts.length}</span>
          </div>
          <div className="alert-list">
            {alerts.length ? alerts.map((alert) => (
              <div className={`alert-row ${alert.level}`} key={alert.title}>
                <span aria-hidden="true">{alert.level === "high" ? "!" : "i"}</span>
                <div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </div>
              </div>
            )) : (
              <div className="all-clear">
                <span>✓</span>
                <div><strong>All monitored KPIs are stable</strong><p>No threshold alerts for this selection.</p></div>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="insight-panel">
        <div className="insight-mark" aria-hidden="true">01</div>
        <div>
          <p className="eyebrow">Automated insight</p>
          <h2>{insight.title}</h2>
          <p>{insight.evidence}</p>
        </div>
        <div className="recommended-action">
          <span>Recommended action</span>
          <strong>{insight.action}</strong>
        </div>
      </section>
    </>
  );
}

function MiniTrend({
  label,
  values,
  periods,
  target,
  type,
  targetMet,
}: {
  label: string;
  values: (number | null)[];
  periods: string[];
  target: number;
  type: MetricCardConfig["type"];
  targetMet: boolean;
}) {
  const numeric = values.map((value) => value ?? 0);
  const ceiling =
    type === "percent"
      ? 100
      : Math.max(target, ...numeric, 1) * 1.15;
  const targetPosition = Math.min(100, Math.max(0, (target / ceiling) * 100));
  const description = values
    .map((value) => formatMetric(value, type))
    .join(", ");

  return (
    <div
      className="mini-trend"
      role="img"
      aria-label={`${label} weekly trend: ${description}. Target ${formatMetric(target, type)}.`}
    >
      <span
        className="mini-target"
        style={{ bottom: `${targetPosition}%` }}
        aria-hidden="true"
      />
      <div className="mini-bars">
        {numeric.map((value, index) => (
          <span
            className={`mini-value tooltip-bar ${targetMet ? "mini-good" : "mini-risk"}`}
            key={`${label}-${index}`}
            style={{ height: `${Math.max(5, (value / ceiling) * 100)}%` }}
            data-tooltip={`${periods[index] ?? `Period ${index + 1}`} · ${formatMetric(values[index], type)}`}
            tabIndex={0}
            aria-label={`${periods[index] ?? `Period ${index + 1}`}, ${label} ${formatMetric(values[index], type)}`}
          />
        ))}
      </div>
    </div>
  );
}

function buildWeeklyTrends(records: TicketRecord[]) {
  const sorted = [...records].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  if (!sorted.length) return [];
  const first = new Date(`${sorted[0].createdAt}T00:00:00Z`);
  const groups = new Map<number, TicketRecord[]>();

  sorted.forEach((record) => {
    const date = new Date(`${record.createdAt}T00:00:00Z`);
    const day = Math.floor((date.getTime() - first.getTime()) / 86400000);
    const group = Math.floor(day / 7);
    groups.set(group, [...(groups.get(group) ?? []), record]);
  });

  return [...groups.entries()].map(([group, groupRecords]) => {
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() + group * 7);
    const summary = calculateKpis(groupRecords);
    return {
      label: start.toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      csat: summary.csatPercent,
      sla: summary.slaComplianceRate,
      volume: summary.ticketCount,
      summary,
    };
  });
}

function buildAlerts(kpis: KpiSummary) {
  const alerts: { title: string; detail: string; level: "high" | "medium" }[] = [];
  if ((kpis.slaComplianceRate ?? 100) < 90) {
    alerts.push({
      title: "SLA compliance is below target",
      detail: `${formatMetric(kpis.slaComplianceRate, "percent")} achieved against the 90% service target.`,
      level: (kpis.slaComplianceRate ?? 100) < 75 ? "high" : "medium",
    });
  }
  if ((kpis.csatPercent ?? 100) < 85) {
    alerts.push({
      title: "Customer satisfaction needs attention",
      detail: `${formatMetric(kpis.csatPercent, "percent")} positive responses, below the 85% target.`,
      level: (kpis.csatPercent ?? 100) < 70 ? "high" : "medium",
    });
  }
  if ((kpis.averageFirstResponseMinutes ?? 0) > 20) {
    alerts.push({
      title: "First response is running slow",
      detail: `${formatMetric(kpis.averageFirstResponseMinutes, "minutes")} average against a 20-minute target.`,
      level: (kpis.averageFirstResponseMinutes ?? 0) > 35 ? "high" : "medium",
    });
  }
  if (kpis.backlog > 3) {
    alerts.push({
      title: "Backlog is above the operating limit",
      detail: `${kpis.backlog} unresolved tickets remain against a limit of 3.`,
      level: kpis.backlog > 5 ? "high" : "medium",
    });
  }
  return alerts.slice(0, 3);
}

function buildInsight(records: TicketRecord[], overall: KpiSummary) {
  const categoryGroups = new Map<string, TicketRecord[]>();
  records.forEach((record) => {
    categoryGroups.set(record.category, [
      ...(categoryGroups.get(record.category) ?? []),
      record,
    ]);
  });
  const ranked = [...categoryGroups.entries()]
    .map(([category, categoryRecords]) => ({
      category,
      records: categoryRecords,
      kpis: calculateKpis(categoryRecords),
    }))
    .filter((group) => group.records.length >= 2)
    .sort(
      (a, b) =>
        (a.kpis.csatPercent ?? 101) - (b.kpis.csatPercent ?? 101) ||
        (b.kpis.averageFirstResponseMinutes ?? 0) -
          (a.kpis.averageFirstResponseMinutes ?? 0),
    );
  const focus = ranked[0];

  if (!focus) {
    return {
      title: "The selected records are stable but limited.",
      evidence: "More ticket volume is needed before a reliable issue pattern can be identified.",
      action: "Expand the date range or remove one filter to strengthen the comparison.",
    };
  }

  const responseGap =
    (focus.kpis.averageFirstResponseMinutes ?? 0) -
    (overall.averageFirstResponseMinutes ?? 0);
  return {
    title: `${focus.category} is the clearest service risk.`,
    evidence: `${focus.records.length} selected tickets recorded ${formatMetric(focus.kpis.csatPercent, "percent")} CSAT and ${formatMetric(focus.kpis.averageFirstResponseMinutes, "minutes")} first response${responseGap > 0 ? `, ${responseGap.toFixed(1)} minutes slower than the selection average` : ""}.`,
    action:
      focus.category === "Payment Failed" || focus.category === "Refund Request"
        ? "Review the Payment escalation queue and response ownership for this issue."
        : "Review staffing coverage and the resolution playbook for this issue category.",
  };
}

const performanceDimensions: {
  key: PerformanceDimension;
  label: string;
}[] = [
  { key: "team", label: "Team" },
  { key: "agent", label: "Agent" },
  { key: "channel", label: "Channel" },
  { key: "category", label: "Issue category" },
  { key: "segment", label: "Customer segment" },
];

const performanceMetrics: {
  key: PerformanceMetric;
  label: string;
  shortLabel: string;
  type: "percent" | "minutes";
  direction: MetricDirection;
}[] = [
  { key: "csatPercent", label: "Customer satisfaction", shortLabel: "CSAT", type: "percent", direction: "higher" },
  { key: "averageFirstResponseMinutes", label: "First response time", shortLabel: "Response", type: "minutes", direction: "lower" },
  { key: "resolutionRate", label: "Resolution rate", shortLabel: "Resolution", type: "percent", direction: "higher" },
  { key: "slaComplianceRate", label: "SLA compliance", shortLabel: "SLA", type: "percent", direction: "higher" },
];

type SortKey =
  | "name"
  | "ticketCount"
  | "csatPercent"
  | "averageFirstResponseMinutes"
  | "resolutionRate"
  | "slaComplianceRate";

function PerformanceAnalysis({
  records,
  previousRecords,
  periodLabel,
}: {
  records: TicketRecord[];
  previousRecords: TicketRecord[];
  periodLabel: string;
}) {
  const [dimension, setDimension] = useState<PerformanceDimension>("team");
  const [metric, setMetric] = useState<PerformanceMetric>("csatPercent");
  const [sortKey, setSortKey] = useState<SortKey>("csatPercent");
  const [sortAscending, setSortAscending] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const groups = groupPerformance(records, dimension);
  const previousGroups = groupPerformance(previousRecords, dimension);
  const metricConfig =
    performanceMetrics.find((item) => item.key === metric) ??
    performanceMetrics[0];
  const currentOverall = calculateKpis(records);
  const previousOverall = calculateKpis(previousRecords);
  const currentMetric = currentOverall[metric];
  const previousMetric = previousRecords.length ? previousOverall[metric] : null;
  const comparison = compareMetric(
    currentMetric,
    previousMetric,
    metricConfig.direction,
  );
  const contributor = findLargestContributor(groups, previousGroups, metric);
  const ranked = [...groups]
    .filter((group) => metricValue(group, metric) !== null)
    .sort((a, b) => {
      const aValue = metricValue(a, metric) ?? 0;
      const bValue = metricValue(b, metric) ?? 0;
      return metricConfig.direction === "higher"
        ? bValue - aValue
        : aValue - bValue;
    });
  const best = ranked[0] ?? null;
  const lowest = ranked[ranked.length - 1] ?? null;
  const sortedGroups = [...groups].sort((a, b) => {
    const aValue = sortKey === "name" ? a.name : a.kpis[sortKey];
    const bValue = sortKey === "name" ? b.name : b.kpis[sortKey];
    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortAscending
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    const numericA = typeof aValue === "number" ? aValue : -Infinity;
    const numericB = typeof bValue === "number" ? bValue : -Infinity;
    return sortAscending ? numericA - numericB : numericB - numericA;
  });
  const selectedGroup =
    groups.find((group) => group.name === selectedName) ?? null;
  const maxChartValue = Math.max(
    ...groups.map((group) => metricValue(group, metric) ?? 0),
    metricConfig.type === "percent" ? 100 : 1,
  );

  const changeSort = (next: SortKey) => {
    if (next === sortKey) {
      setSortAscending((value) => !value);
    } else {
      setSortKey(next);
      setSortAscending(next === "name");
    }
  };

  if (!records.length) {
    return (
      <section className="empty-state">
        <span aria-hidden="true">0</span>
        <h2>No performance records</h2>
        <p>Adjust the shared filters to compare operational performance.</p>
      </section>
    );
  }

  return (
    <>
      <section className="analysis-heading">
        <div>
          <p className="eyebrow">Performance analysis · {periodLabel}</p>
          <h2>Find what is driving the result.</h2>
          <p>Compare groups, rank performance, and open the records behind every result.</p>
        </div>
        <div className="period-comparison">
          <span>{metricConfig.shortLabel}</span>
          <strong>{formatMetric(currentMetric, metricConfig.type)}</strong>
          <small className={comparison.isImprovement ? "improved" : comparison.isImprovement === false ? "declined" : "neutral"}>
            {comparison.delta === null
              ? "No prior comparison"
              : `${comparison.delta > 0 ? "+" : ""}${comparison.delta.toFixed(1)}${metricConfig.type === "percent" ? " pts" : " min"} vs previous`}
          </small>
        </div>
      </section>

      <section className="analysis-controls" aria-label="Performance analysis controls">
        <div>
          <span>Break down by</span>
          <div className="segmented-control">
            {performanceDimensions.map((item) => (
              <button
                className={dimension === item.key ? "active" : ""}
                key={item.key}
                onClick={() => {
                  setDimension(item.key);
                  setSelectedName(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span>Analyze metric</span>
          <div className="segmented-control metric-selector">
            {performanceMetrics.map((item) => (
              <button
                className={metric === item.key ? "active" : ""}
                key={item.key}
                onClick={() => {
                  setMetric(item.key);
                  setSortKey(item.key);
                  setSortAscending(item.direction === "lower");
                }}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="performance-summary-grid">
        <article className="performer-card best">
          <span>Highest performer</span>
          <strong>{best?.name ?? "—"}</strong>
          <b>{best ? formatMetric(metricValue(best, metric), metricConfig.type) : "—"}</b>
          <small>Based on {metricConfig.label.toLowerCase()}</small>
        </article>
        <article className="performer-card risk">
          <span>Needs attention</span>
          <strong>{lowest?.name ?? "—"}</strong>
          <b>{lowest ? formatMetric(metricValue(lowest, metric), metricConfig.type) : "—"}</b>
          <small>Lowest ranked for this selection</small>
        </article>
        <article className="performer-card movement">
          <span>Largest period movement</span>
          <strong>{contributor?.name ?? "Not available"}</strong>
          <b className={
            contributor
              ? compareMetric(
                  contributor.currentValue,
                  contributor.previousValue,
                  metricConfig.direction,
                ).isImprovement
                ? "improved"
                : "declined"
              : "neutral"
          }>
            {contributor?.delta !== null && contributor
              ? `${contributor.delta > 0 ? "+" : ""}${contributor.delta.toFixed(1)}${metricConfig.type === "percent" ? " pts" : " min"}`
              : "—"}
          </b>
          <small>
            {contributor
              ? "Largest change vs equivalent previous period"
              : "Select a period with comparable prior data"}
          </small>
        </article>
      </section>

      <section className="analysis-visual-grid">
        <article className="ranking-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Interactive ranking</p>
              <h2>{metricConfig.label} by {performanceDimensions.find((item) => item.key === dimension)?.label.toLowerCase()}</h2>
            </div>
            <span className="phase-chip">Click to inspect</span>
          </div>
          <div className="ranking-chart">
            {ranked.map((group, index) => {
              const value = metricValue(group, metric) ?? 0;
              const width = Math.max(4, (value / maxChartValue) * 100);
              return (
                <button
                  className={`ranking-row ${selectedGroup?.name === group.name ? "selected" : ""}`}
                  key={group.name}
                  onClick={() => setSelectedName(group.name)}
                  aria-label={`Inspect ${group.name}, ${metricConfig.label} ${formatMetric(value, metricConfig.type)}`}
                >
                  <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="rank-name">{group.name}</span>
                  <span className="rank-track">
                    <i style={{ width: `${width}%` }} />
                  </span>
                  <strong>{formatMetric(value, metricConfig.type)}</strong>
                </button>
              );
            })}
          </div>
        </article>

        <article className="comparison-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Equivalent periods</p>
              <h2>Current vs previous</h2>
            </div>
          </div>
          <div className="period-bars">
            <PeriodBar
              label="Current period"
              value={currentMetric}
              type={metricConfig.type}
              max={Math.max(currentMetric ?? 0, previousMetric ?? 0, metricConfig.type === "percent" ? 100 : 1)}
              current
            />
            <PeriodBar
              label="Previous period"
              value={previousMetric}
              type={metricConfig.type}
              max={Math.max(currentMetric ?? 0, previousMetric ?? 0, metricConfig.type === "percent" ? 100 : 1)}
            />
          </div>
          <div className="comparison-note">
            <span className="status-dot" />
            <p>
              Both periods use the same number of calendar days and inherit all shared operational filters.
            </p>
          </div>
        </article>
      </section>

      <section className="performance-table-panel">
        <div className="section-title compact">
          <div>
            <p className="eyebrow">Performance detail</p>
            <h2>Sortable comparison table</h2>
          </div>
          <small>{groups.reduce((total, group) => total + group.kpis.ticketCount, 0)} records reconciled</small>
        </div>
        <div className="table-scroll">
          <table className="performance-table">
            <thead>
              <tr>
                <SortableHeader label="Group" sort="name" active={sortKey} ascending={sortAscending} onSort={changeSort} />
                <SortableHeader label="Volume" sort="ticketCount" active={sortKey} ascending={sortAscending} onSort={changeSort} />
                <SortableHeader label="CSAT" sort="csatPercent" active={sortKey} ascending={sortAscending} onSort={changeSort} />
                <SortableHeader label="Response" sort="averageFirstResponseMinutes" active={sortKey} ascending={sortAscending} onSort={changeSort} />
                <SortableHeader label="Resolution" sort="resolutionRate" active={sortKey} ascending={sortAscending} onSort={changeSort} />
                <SortableHeader label="SLA" sort="slaComplianceRate" active={sortKey} ascending={sortAscending} onSort={changeSort} />
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map((group) => (
                <tr key={group.name} className={selectedGroup?.name === group.name ? "selected" : ""}>
                  <td><button onClick={() => setSelectedName(group.name)}>{group.name}<small>View records →</small></button></td>
                  <td>{group.kpis.ticketCount}</td>
                  <td>{formatMetric(group.kpis.csatPercent, "percent")}</td>
                  <td>{formatMetric(group.kpis.averageFirstResponseMinutes, "minutes")}</td>
                  <td>{formatMetric(group.kpis.resolutionRate, "percent")}</td>
                  <td>{formatMetric(group.kpis.slaComplianceRate, "percent")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedGroup && (
        <section className="drilldown-panel" aria-live="polite">
          <div className="drilldown-heading">
            <div>
              <p className="eyebrow">Contributing records</p>
              <h2>{selectedGroup.name}</h2>
              <span>{selectedGroup.records.length} tickets behind this result</span>
            </div>
            <button onClick={() => setSelectedName(null)} aria-label="Close contributing records">×</button>
          </div>
          <div className="record-grid">
            {selectedGroup.records.map((record) => (
              <article key={record.id}>
                <div><strong>{record.id}</strong><span className={`record-status ${record.status.toLowerCase()}`}>{record.status}</span></div>
                <p>{record.category}</p>
                <small>{record.createdAt} · {record.channel} · {record.agent}</small>
                <div className="record-metrics">
                  <span>CSAT <b>{record.csatScore ?? "—"}/5</b></span>
                  <span>Response <b>{record.firstResponseMinutes === null ? "—" : `${record.firstResponseMinutes}m`}</b></span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function SortableHeader({
  label,
  sort,
  active,
  ascending,
  onSort,
}: {
  label: string;
  sort: SortKey;
  active: SortKey;
  ascending: boolean;
  onSort: (sort: SortKey) => void;
}) {
  return (
    <th>
      <button onClick={() => onSort(sort)}>
        {label} <span>{active === sort ? (ascending ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function PeriodBar({
  label,
  value,
  type,
  max,
  current = false,
}: {
  label: string;
  value: number | null;
  type: "percent" | "minutes";
  max: number;
  current?: boolean;
}) {
  return (
    <div className="period-bar">
      <div><span>{label}</span><strong>{formatMetric(value, type)}</strong></div>
      <i><b className={current ? "current" : ""} style={{ width: `${value === null ? 0 : (value / max) * 100}%` }} /></i>
    </div>
  );
}

function CustomerIssues({
  records,
  previousRecords,
  periodLabel,
}: {
  records: TicketRecord[];
  previousRecords: TicketRecord[];
  periodLabel: string;
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const issues = analyzeIssues(records);
  const previousIssues = analyzeIssues(previousRecords);
  const focus =
    issues.find((issue) => issue.category === selectedCategory) ??
    issues[0] ??
    null;
  const teamGroups = groupPerformance(records, "team");
  const trend = buildIssueVolumeTrend(records);

  if (!records.length || !focus) {
    return (
      <section className="empty-state">
        <span aria-hidden="true">0</span>
        <h2>No customer issues found</h2>
        <p>Adjust the shared filters to restore issue and root-cause analysis.</p>
      </section>
    );
  }

  const priorFocus = previousIssues.find(
    (issue) => issue.category === focus.category,
  );
  const volumeChange = priorFocus
    ? focus.records.length - priorFocus.records.length
    : null;

  return (
    <>
      <section className="issues-heading">
        <div>
          <p className="eyebrow">Customer issues · {periodLabel}</p>
          <h2>Turn recurring issues into owned actions.</h2>
          <p>Trace service deterioration to the issue, team, and workflow responsible.</p>
        </div>
        <div className={`priority-badge ${focus.priority.toLowerCase()}`}>
          <span>Top priority</span>
          <strong>{focus.category}</strong>
          <small>{focus.priority} · score {focus.priorityScore.toFixed(0)}</small>
        </div>
      </section>

      <section className="team-comparison-grid" aria-label="Cross-team issue comparison">
        {(["Customer Service", "Operations", "Payment"] as const).map((teamName) => {
          const group = teamGroups.find((item) => item.name === teamName);
          return (
            <article className={`team-issue-card ${teamName.toLowerCase().replace(" ", "-")}`} key={teamName}>
              <div>
                <span>{teamName}</span>
                <b>{group?.kpis.ticketCount ?? 0} issues</b>
              </div>
              <span className="team-primary-label">Customer satisfaction (CSAT)</span>
              <strong>{formatMetric(group?.kpis.csatPercent ?? null, "percent")}</strong>
              <div className="team-secondary-metric">
                <span>Average first response</span>
                <b>{formatMetric(group?.kpis.averageFirstResponseMinutes ?? null, "minutes")}</b>
              </div>
              <div className="team-resolution-label">
                <span>Resolution rate</span>
                <b>{formatMetric(group?.kpis.resolutionRate ?? null, "percent")}</b>
              </div>
              <div className="team-health">
                <i style={{ width: `${group?.kpis.resolutionRate ?? 0}%` }} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="issues-main-grid">
        <article className="issue-trend-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Issue volume trend</p>
              <h2>Weekly category movement</h2>
            </div>
            <span className="phase-chip">Hover for values</span>
          </div>
          <div className="issue-trend-chart">
            <div
              className="trend-week-labels"
              style={{
                gridTemplateColumns: `minmax(115px, 1fr) repeat(${trend.labels.length}, minmax(38px, .55fr))`,
              }}
            >
              <span />
              {trend.labels.map((label) => <b key={label}>{label}</b>)}
            </div>
            {issues.map((issue) => {
              const values = trend.byCategory.get(issue.category) ?? [];
              const maximum = Math.max(1, ...values);
              return (
                <button
                  className={`issue-trend-row ${focus.category === issue.category ? "active" : ""}`}
                  key={issue.category}
                  onClick={() => setSelectedCategory(issue.category)}
                  style={{
                    gridTemplateColumns: `minmax(115px, 1fr) repeat(${trend.labels.length}, minmax(38px, .55fr))`,
                  }}
                >
                  <strong>{issue.category}</strong>
                  {values.map((value, index) => (
                    <span className="issue-trend-cell" key={`${issue.category}-${index}`}>
                      <i
                        className="tooltip-bar"
                        style={{ height: `${Math.max(8, (value / maximum) * 100)}%` }}
                        data-tooltip={`${trend.labels[index]} · ${value} ${value === 1 ? "ticket" : "tickets"}`}
                      />
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </article>

        <article className="priority-matrix-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Priority matrix</p>
              <h2>Volume vs customer impact</h2>
            </div>
          </div>
          <div className="priority-matrix" role="img" aria-label="Issue priority matrix plotting relative issue volume against customer impact">
            <span className="matrix-quadrant top-left">High impact</span>
            <span className="matrix-quadrant top-right">Act now</span>
            <span className="matrix-quadrant bottom-left">Monitor</span>
            <span className="matrix-quadrant bottom-right">High volume</span>
            {issues.map((issue) => (
              <button
                className={`matrix-dot tooltip-bar ${focus.category === issue.category ? "active" : ""}`}
                key={issue.category}
                style={{
                  left: `${Math.min(94, Math.max(6, issue.volumeIndex))}%`,
                  bottom: `${Math.min(92, Math.max(8, issue.impactScore))}%`,
                }}
                data-tooltip={`${issue.category} · Volume ${issue.volumeIndex.toFixed(0)} · Impact ${issue.impactScore.toFixed(0)}`}
                aria-label={`Select ${issue.category}, volume index ${issue.volumeIndex.toFixed(0)}, impact score ${issue.impactScore.toFixed(0)}`}
                onClick={() => setSelectedCategory(issue.category)}
              >
                {issue.category.split(" ").map((word) => word[0]).join("")}
              </button>
            ))}
          </div>
          <div className="matrix-axis x-axis">Relative issue volume →</div>
          <div className="matrix-axis y-axis">Customer impact →</div>
        </article>
      </section>

      <section className="root-cause-panel">
        <div className="section-title compact">
          <div>
            <p className="eyebrow">Root-cause evidence</p>
            <h2>Issue categories linked to service outcomes</h2>
          </div>
          <small>Click a category to update the recommendation</small>
        </div>
        <div className="table-scroll">
          <table className="root-cause-table">
            <thead>
              <tr>
                <th>Issue category</th>
                <th>Volume</th>
                <th>CSAT</th>
                <th>Response</th>
                <th>Resolution</th>
                <th>Impact</th>
                <th>Priority</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr
                  key={issue.category}
                  className={focus.category === issue.category ? "selected" : ""}
                >
                  <td><button onClick={() => setSelectedCategory(issue.category)}>{issue.category}</button></td>
                  <td>{issue.records.length}</td>
                  <td>{formatMetric(issue.kpis.csatPercent, "percent")}</td>
                  <td>{formatMetric(issue.kpis.averageFirstResponseMinutes, "minutes")}</td>
                  <td>{formatMetric(issue.kpis.resolutionRate, "percent")}</td>
                  <td>{issue.impactScore.toFixed(0)}</td>
                  <td><span className={`priority-pill ${issue.priority.toLowerCase()}`}>{issue.priority}</span></td>
                  <td><span className="owner-pill">{issue.owner}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="issue-recommendation">
        <div className="recommendation-score">
          <span>Priority</span>
          <strong>{focus.priorityScore.toFixed(0)}</strong>
          <small>/100</small>
        </div>
        <div>
          <p className="eyebrow">Recommended follow-up · {focus.owner}</p>
          <h2>{recommendationForIssue(focus)}</h2>
          <p>
            {focus.records.length} tickets produced {formatMetric(focus.kpis.csatPercent, "percent")} CSAT,
            {" "}{formatMetric(focus.kpis.averageFirstResponseMinutes, "minutes")} response time, and
            {" "}{formatMetric(focus.kpis.resolutionRate, "percent")} resolution.
            {volumeChange !== null
              ? ` Volume is ${Math.abs(volumeChange)} ${volumeChange >= 0 ? "higher" : "lower"} than the equivalent prior period.`
              : ""}
          </p>
        </div>
        <div className="scoring-model">
          <span>Transparent scoring model</span>
          <strong>40% volume + 60% impact</strong>
          <small>Impact = 40% dissatisfaction + 35% unresolved + 25% response pressure</small>
        </div>
      </section>
    </>
  );
}

function buildIssueVolumeTrend(records: TicketRecord[]) {
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!sorted.length) {
    return { labels: [], byCategory: new Map<string, number[]>() };
  }
  const first = new Date(`${sorted[0].createdAt}T00:00:00Z`);
  const maximumGroup = Math.max(
    0,
    ...sorted.map((record) => {
      const date = new Date(`${record.createdAt}T00:00:00Z`);
      return Math.floor((date.getTime() - first.getTime()) / 86400000 / 7);
    }),
  );
  const labels = Array.from({ length: maximumGroup + 1 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + index * 7);
    return date.toLocaleDateString("en-MY", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  });
  const byCategory = new Map<string, number[]>();
  sorted.forEach((record) => {
    const date = new Date(`${record.createdAt}T00:00:00Z`);
    const group = Math.floor((date.getTime() - first.getTime()) / 86400000 / 7);
    const values = byCategory.get(record.category) ?? Array(labels.length).fill(0);
    values[group] += 1;
    byCategory.set(record.category, values);
  });
  return { labels, byCategory };
}

function recommendationForIssue(issue: IssueAnalysis) {
  const actions: Record<IssueAnalysis["owner"], string> = {
    CX: "Review the customer communication and escalation policy for refund cases.",
    Operations: "Investigate delivery handoffs and clarify ownership at delayed workflow stages.",
    Payment: "Prioritize payment-failure diagnostics and strengthen the escalation path.",
    Product: "Improve product guidance and convert recurring questions into self-service content.",
    Technology: "Review authentication failures and remove friction from the account-access flow.",
  };
  return actions[issue.owner];
}

function AIAndAutomation({
  records,
  periodLabel,
}: {
  records: TicketRecord[];
  periodLabel: string;
}) {
  const [targetContainment, setTargetContainment] = useState(70);
  const [minutesSaved, setMinutesSaved] = useState(AVOIDED_MANUAL_MINUTES);
  const chatbot = calculateChatbotMetrics(records);
  const opportunities = rankAutomationOpportunities(records);
  const chatbotRecords = records.filter(
    (record) => record.channel === "Chatbot" && record.chatbotOutcome,
  );
  const fallbackIntents = [...new Set(chatbotRecords.map((record) => record.category))]
    .map((category) => {
      const intentRecords = chatbotRecords.filter(
        (record) => record.category === category,
      );
      const fallback = intentRecords.filter(
        (record) => record.chatbotOutcome === "Fallback",
      ).length;
      const handoff = intentRecords.filter(
        (record) => record.chatbotOutcome === "Handoff",
      ).length;
      const resolved = intentRecords.filter(
        (record) => record.chatbotOutcome === "Resolved",
      ).length;
      return {
        category,
        conversations: intentRecords.length,
        fallback,
        handoff,
        resolved,
        fallbackRate: intentRecords.length
          ? (fallback / intentRecords.length) * 100
          : 0,
      };
    })
    .sort((a, b) => b.fallbackRate - a.fallbackRate);
  const primaryFallback = fallbackIntents[0] ?? null;
  const trend = buildChatbotTrend(chatbotRecords);
  const scenario = projectAutomationScenario(
    chatbot,
    targetContainment,
    minutesSaved,
  );
  const resolvedBotRecords = chatbotRecords.filter(
    (record) => record.chatbotOutcome === "Resolved",
  );
  const resolvedBotKpis = calculateKpis(resolvedBotRecords);
  const resolvedBotRepeatRate = resolvedBotRecords.length
    ? (resolvedBotRecords.filter((record) => record.reopened || record.repeatContact).length /
      resolvedBotRecords.length) * 100
    : null;
  const resolvedBotEscalationRate = resolvedBotRecords.length
    ? (resolvedBotRecords.filter((record) => record.escalated).length /
      resolvedBotRecords.length) * 100
    : null;

  if (!records.length) {
    return (
      <section className="empty-state">
        <span aria-hidden="true">0</span>
        <h2>No AI or automation records</h2>
        <p>Adjust the shared filters to restore chatbot and workload analysis.</p>
      </section>
    );
  }

  return (
    <>
      <section className="automation-heading">
        <div>
          <p className="eyebrow">AI & automation · {periodLabel}</p>
          <h2>Measure what the bot resolves—and what it cannot.</h2>
          <p>Connect conversation outcomes to improvement priorities and manual workload savings.</p>
        </div>
        <div className="ai-status">
          <span>Eligible conversations</span>
          <strong>{chatbot.conversations}</strong>
          <small>Resolved + fallback + handoff</small>
        </div>
      </section>

      <section className="ai-metric-grid" aria-label="Chatbot performance metrics">
        <AIMetricCard
          label="Containment rate"
          value={formatMetric(chatbot.containmentRate, "percent")}
          detail={`${chatbot.resolved} conversations resolved without an agent`}
          tone="good"
        />
        <AIMetricCard
          label="Fallback rate"
          value={formatMetric(chatbot.fallbackRate, "percent")}
          detail={`${chatbot.fallback} unrecognized or unsupported intents`}
          tone={chatbot.fallbackRate && chatbot.fallbackRate > 25 ? "risk" : "neutral"}
        />
        <AIMetricCard
          label="Human handoff rate"
          value={formatMetric(chatbot.handoffRate, "percent")}
          detail={`${chatbot.handoff} conversations transferred to an agent`}
          tone={chatbot.handoffRate && chatbot.handoffRate > 25 ? "risk" : "neutral"}
        />
        <AIMetricCard
          label="Estimated workload saved"
          value={`${chatbot.estimatedHoursSaved.toFixed(1)} hrs`}
          detail={`${chatbot.ticketsAvoided} tickets avoided · ${AVOIDED_MANUAL_MINUTES} min assumed each`}
          tone="good"
        />
      </section>

      <section className="ai-overview-grid">
        <article className="outcome-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Outcome distribution</p>
              <h2>Where conversations ended</h2>
            </div>
            <span className="phase-chip">Exact outcomes</span>
          </div>
          <div
            className="outcome-stack"
            role="img"
            aria-label={`${chatbot.resolved} resolved, ${chatbot.fallback} fallback, ${chatbot.handoff} human handoff`}
          >
            {chatbot.conversations > 0 && (
              <>
                <span
                  className="resolved tooltip-bar"
                  style={{ width: `${(chatbot.resolved / chatbot.conversations) * 100}%` }}
                  data-tooltip={`Resolved · ${chatbot.resolved} conversations`}
                  tabIndex={0}
                />
                <span
                  className="fallback tooltip-bar"
                  style={{ width: `${(chatbot.fallback / chatbot.conversations) * 100}%` }}
                  data-tooltip={`Fallback · ${chatbot.fallback} conversations`}
                  tabIndex={0}
                />
                <span
                  className="handoff tooltip-bar"
                  style={{ width: `${(chatbot.handoff / chatbot.conversations) * 100}%` }}
                  data-tooltip={`Handoff · ${chatbot.handoff} conversations`}
                  tabIndex={0}
                />
              </>
            )}
          </div>
          <div className="outcome-legend">
            <span><i className="resolved" />Resolved <b>{chatbot.resolved}</b></span>
            <span><i className="fallback" />Fallback <b>{chatbot.fallback}</b></span>
            <span><i className="handoff" />Handoff <b>{chatbot.handoff}</b></span>
          </div>
          <div className="chatbot-weekly">
            <div className="section-title compact">
              <div>
                <p className="eyebrow">Weekly movement</p>
                <h2>Conversation outcomes</h2>
              </div>
            </div>
            {trend.map((week) => (
              <div className="chatbot-week-row" key={week.label}>
                <span>{week.label}</span>
                <div>
                  <i
                    className="resolved tooltip-bar"
                    style={{ width: `${week.total ? (week.resolved / week.total) * 100 : 0}%` }}
                    data-tooltip={`Resolved · ${week.resolved}`}
                  />
                  <i
                    className="fallback tooltip-bar"
                    style={{ width: `${week.total ? (week.fallback / week.total) * 100 : 0}%` }}
                    data-tooltip={`Fallback · ${week.fallback}`}
                  />
                  <i
                    className="handoff tooltip-bar"
                    style={{ width: `${week.total ? (week.handoff / week.total) * 100 : 0}%` }}
                    data-tooltip={`Handoff · ${week.handoff}`}
                  />
                </div>
                <b>{week.total}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="fallback-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Fallback scenarios</p>
              <h2>Intent-level performance</h2>
            </div>
          </div>
          <div className="fallback-list">
            {fallbackIntents.map((intent) => (
              <div key={intent.category}>
                <div>
                  <strong>{intent.category}</strong>
                  <span>{intent.conversations} conversations</span>
                </div>
                <div className="intent-outcomes">
                  <span>Resolved <b>{intent.resolved}</b></span>
                  <span>Fallback <b>{intent.fallback}</b></span>
                  <span>Handoff <b>{intent.handoff}</b></span>
                </div>
                <div className="fallback-rate">
                  <i style={{ width: `${intent.fallbackRate}%` }} />
                </div>
                <small>{intent.fallbackRate.toFixed(1)}% fallback rate</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="automation-scenario-panel">
        <div className="scenario-heading">
          <div>
            <p className="eyebrow">Automation impact scenario</p>
            <h2>Estimate the gain—then check the customer outcome.</h2>
            <p>Adjust the assumptions to model potential workload reduction. This is a planning estimate, not realized savings.</p>
          </div>
          <div className="scenario-current">
            <span>Current containment</span>
            <strong>{formatMetric(chatbot.containmentRate, "percent")}</strong>
            <small>{chatbot.resolved} of {chatbot.conversations} eligible conversations</small>
          </div>
        </div>
        <div className="scenario-layout">
          <div className="scenario-controls">
            <label>
              <span><b>Target containment</b><strong>{scenario.targetContainmentRate.toFixed(0)}%</strong></span>
              <input
                type="range"
                min={Math.ceil(chatbot.containmentRate ?? 0)}
                max="100"
                step="5"
                value={Math.max(targetContainment, Math.ceil(chatbot.containmentRate ?? 0))}
                onChange={(event) => setTargetContainment(Number(event.target.value))}
                aria-label="Target chatbot containment rate"
              />
              <small>Raise only where intent quality and knowledge coverage support it.</small>
            </label>
            <label>
              <span><b>Minutes avoided per containment</b><strong>{minutesSaved} min</strong></span>
              <input
                type="range"
                min="5"
                max="30"
                step="1"
                value={minutesSaved}
                onChange={(event) => setMinutesSaved(Number(event.target.value))}
                aria-label="Minutes of agent work avoided per contained conversation"
              />
              <small>Use the team’s average assisted handling effort when available.</small>
            </label>
          </div>
          <div className="scenario-results" aria-live="polite">
            <article><span>Projected contained</span><strong>{scenario.projectedContainedConversations}</strong><small>+{scenario.additionalContainedConversations} conversations</small></article>
            <article><span>Projected hours saved</span><strong>{scenario.projectedHoursSaved.toFixed(1)}</strong><small>+{scenario.additionalHoursSaved.toFixed(1)} incremental hours</small></article>
            <article><span>Remaining assisted</span><strong>{Math.max(0, chatbot.conversations - scenario.projectedContainedConversations)}</strong><small>Fallback or agent handoff capacity</small></article>
          </div>
        </div>
        <div className="quality-guardrails">
          <div><span>Contained CSAT</span><strong>{formatMetric(resolvedBotKpis.csatPercent, "percent")}</strong><small>Protect customer satisfaction</small></div>
          <div><span>Repeat-contact signal</span><strong>{formatMetric(resolvedBotRepeatRate, "percent")}</strong><small>Lower is better after containment</small></div>
          <div><span>Escalation signal</span><strong>{formatMetric(resolvedBotEscalationRate, "percent")}</strong><small>Watch for hidden failure demand</small></div>
          <p><b>Decision rule:</b> increase containment only when satisfaction remains healthy and repeat contact or escalation does not worsen.</p>
        </div>
      </section>

      <section className="automation-table-panel">
        <div className="section-title compact">
          <div>
            <p className="eyebrow">Manual workload opportunities</p>
            <h2>Ranked automation opportunity table</h2>
          </div>
          <span className="phase-chip">Highest opportunity first</span>
        </div>
        <div className="table-scroll">
          <table className="automation-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Manual issue</th>
                <th>Volume</th>
                <th>Avg handling</th>
                <th>Automation fit</th>
                <th>Potential tickets</th>
                <th>Hours saved</th>
                <th>Opportunity</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((item, index) => (
                <tr key={item.category}>
                  <td>{String(index + 1).padStart(2, "0")}</td>
                  <td><strong>{item.category}</strong><small>{item.recommendation}</small></td>
                  <td>{item.manualTickets}</td>
                  <td>{formatMetric(item.averageHandlingMinutes, "minutes")}</td>
                  <td>{(item.automationFit * 100).toFixed(0)}%</td>
                  <td>{item.estimatedAutomatableTickets}</td>
                  <td>{item.estimatedHoursSaved.toFixed(1)}</td>
                  <td><span className="opportunity-score">{item.score.toFixed(0)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ai-recommendation">
        <div className="ai-recommendation-mark">AI</div>
        <div>
          <p className="eyebrow">Data-driven technology recommendation</p>
          <h2>
            {primaryFallback
              ? `Improve the ${primaryFallback.category.toLowerCase()} intent first.`
              : "Expand the highest-ranked automation opportunity first."}
          </h2>
          <p>
            {primaryFallback
              ? `${primaryFallback.fallbackRate.toFixed(1)}% of ${primaryFallback.category.toLowerCase()} conversations fell back. Review training phrases, missing knowledge, and the handoff trigger with Technology.`
              : opportunities[0]?.recommendation}
          </p>
        </div>
        <div className="assumption-card">
          <span>Estimate assumptions</span>
          <strong>{AVOIDED_MANUAL_MINUTES} minutes per contained conversation</strong>
          <small>Opportunity score = 50% volume + 30% automation fit + 20% handling effort. Estimates are directional, not realized savings.</small>
        </div>
      </section>
    </>
  );
}

function AIMetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "risk" | "neutral";
}) {
  return (
    <article className={`ai-metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function buildChatbotTrend(records: TicketRecord[]) {
  if (!records.length) return [];
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = new Date(`${sorted[0].createdAt}T00:00:00Z`);
  const groups = new Map<number, TicketRecord[]>();
  sorted.forEach((record) => {
    const date = new Date(`${record.createdAt}T00:00:00Z`);
    const index = Math.floor((date.getTime() - first.getTime()) / 86400000 / 7);
    groups.set(index, [...(groups.get(index) ?? []), record]);
  });
  return [...groups.entries()].map(([index, groupRecords]) => {
    const start = new Date(first);
    start.setUTCDate(start.getUTCDate() + index * 7);
    return {
      label: start.toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }),
      total: groupRecords.length,
      resolved: groupRecords.filter((record) => record.chatbotOutcome === "Resolved").length,
      fallback: groupRecords.filter((record) => record.chatbotOutcome === "Fallback").length,
      handoff: groupRecords.filter((record) => record.chatbotOutcome === "Handoff").length,
    };
  });
}

function ProcessHealthPage({
  records,
  periodLabel,
}: {
  records: TicketRecord[];
  periodLabel: string;
}) {
  const [selectedProcessTeam, setSelectedProcessTeam] = useState<"All" | Team>("All");
  const processTeams = [...new Set(records.map((record) => record.team))];
  const analysisDate =
    records
      .map((record) => record.lastActivityAt || record.createdAt)
      .sort()
      .at(-1) ?? "2026-07-27";
  const analysisDateLabel = new Date(`${analysisDate}T00:00:00Z`).toLocaleDateString(
    "en-MY",
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
  );
  const scopedRecords =
    selectedProcessTeam === "All"
      ? records
      : records.filter((record) => record.team === selectedProcessTeam);
  const health = analyzeProcessHealth(scopedRecords, analysisDate, 2);
  const recommendations = recommendProcessActions(health);
  const teamHealth = processTeams
    .map((team) => ({
      team,
      health: analyzeProcessHealth(
        records.filter((record) => record.team === team),
        analysisDate,
        2,
      ),
    }))
    .filter((item) => item.health.records > 0);
  const stageTotal = Math.max(1, health.records);

  if (!records.length) {
    return (
      <section className="empty-state">
        <span aria-hidden="true">0</span>
        <h2>No process-health records</h2>
        <p>Adjust the shared filters to restore adoption and workflow analysis.</p>
      </section>
    );
  }

  const processMetrics = [
    {
      label: "Required fields",
      value: health.requiredFieldCompletionRate,
      target: "Target ≥ 95%",
      detail: "Ticket intake completeness",
    },
    {
      label: "Categorization quality",
      value: health.categorizationAccuracyRate,
      target: "Target ≥ 95%",
      detail: "Correct issue classification",
    },
    {
      label: "Workflow compliance",
      value: health.workflowComplianceRate,
      target: "Target ≥ 95%",
      detail: "Required process followed",
    },
    {
      label: "SLA compliance",
      value: health.slaComplianceRate,
      target: "Target ≥ 90%",
      detail: "Responses within SLA",
    },
    {
      label: "Escalation rate",
      value: health.escalationRate,
      target: "Monitor ≤ 20%",
      detail: "Tickets needing escalation",
      lowerIsBetter: true,
    },
    {
      label: "Reopen rate",
      value: health.reopenRate,
      target: "Monitor ≤ 10%",
      detail: "Tickets reopened after resolution",
      lowerIsBetter: true,
    },
  ];
  const systemUsageMetrics = [
    {
      label: "CRM profile linkage",
      value: health.crmProfileLinkRate,
      target: 90,
      detail: "Customer context linked to the ticket",
      direction: "higher" as const,
    },
    {
      label: "Automated routing",
      value: health.automatedRoutingRate,
      target: 80,
      detail: "Tickets assigned without manual triage",
      direction: "higher" as const,
    },
    {
      label: "Knowledge support",
      value: health.knowledgeBaseUsageRate,
      target: 60,
      detail: "Resolution supported by knowledge content",
      direction: "higher" as const,
    },
    {
      label: "Workflow bypass",
      value: health.workflowBypassRate,
      target: 10,
      detail: "Tickets skipping the expected workflow",
      direction: "lower" as const,
    },
    {
      label: "Chatbot usage",
      value: health.chatbotUsageRate,
      target: null,
      detail: "Share of tickets entering via chatbot",
      direction: "context" as const,
    },
  ];

  return (
    <>
      <section className="process-heading">
        <div>
          <p className="eyebrow">Process health · {periodLabel}</p>
          <h2>Find where tools and workflows break down.</h2>
          <p>Monitor adoption, queue health, data quality, and operational compliance.</p>
        </div>
        <div className="process-scope">
          <span>Analysis scope</span>
          <strong>{selectedProcessTeam}</strong>
          <small>{health.records} records · as of {analysisDateLabel}</small>
        </div>
      </section>

      <section className="process-team-tabs" aria-label="Process team filter">
        {(["All", ...processTeams] as Array<"All" | Team>).map((team) => (
          <button
            className={selectedProcessTeam === team ? "active" : ""}
            key={team}
            onClick={() => setSelectedProcessTeam(team)}
          >
            {team}
          </button>
        ))}
      </section>

      <section className="process-metric-grid">
        {processMetrics.map((metric) => {
          const threshold = metric.label === "SLA compliance" ? 90 : metric.lowerIsBetter ? (metric.label === "Reopen rate" ? 10 : 20) : 95;
          const healthy =
            metric.value !== null &&
            (metric.lowerIsBetter
              ? metric.value <= threshold
              : metric.value >= threshold);
          return (
            <article className={`process-metric-card ${healthy ? "healthy" : "gap"}`} key={metric.label}>
              <div><span>{metric.label}</span><b>{healthy ? "Healthy" : "Gap"}</b></div>
              <strong>{formatMetric(metric.value, "percent")}</strong>
              <p>{metric.detail}</p>
              <small>{metric.target}</small>
            </article>
          );
        })}
      </section>

      <section className="system-adoption-panel">
        <div className="system-adoption-heading">
          <div>
            <p className="eyebrow">System usage & adoption</p>
            <h2>Are teams using the service tools as designed?</h2>
            <p>Track customer context, routing automation, knowledge usage, and workflow discipline across the selected records.</p>
          </div>
          <div className={`adoption-score ${(health.overallSystemAdoptionScore ?? 0) >= 80 ? "healthy" : "gap"}`}>
            <span>Weighted adoption score</span>
            <strong>{formatMetric(health.overallSystemAdoptionScore, "percent")}</strong>
            <small>CRM 30% · routing 25% · knowledge 20% · intake 15% · bypass 10%</small>
          </div>
        </div>
        <div className="system-usage-grid">
          {systemUsageMetrics.map((metric) => {
            const healthy =
              metric.target === null
                ? null
                : metric.value !== null &&
                  (metric.direction === "higher"
                    ? metric.value >= metric.target
                    : metric.value <= metric.target);
            const width = Math.min(100, Math.max(0, metric.value ?? 0));
            return (
              <article className={healthy === null ? "context" : healthy ? "healthy" : "gap"} key={metric.label}>
                <div>
                  <span>{metric.label}</span>
                  <b>{healthy === null ? "Context" : healthy ? "On target" : "Adoption gap"}</b>
                </div>
                <strong>{formatMetric(metric.value, "percent")}</strong>
                <p>{metric.detail}</p>
                <i aria-hidden="true"><b style={{ width: `${width}%` }} /></i>
                <small>
                  {metric.target === null
                    ? "Monitor alongside containment and handoff"
                    : `${metric.direction === "higher" ? "Target ≥" : "Limit ≤"} ${metric.target}%`}
                </small>
              </article>
            );
          })}
        </div>
        <div className="adoption-data-note">
          <span>Data note</span>
          <p>These measures use the optional CRM profile, routing mode, knowledge usage, and workflow bypass fields in the Excel template. Imported files without those fields use conservative defaults.</p>
        </div>
      </section>

      <section className="process-main-grid">
        <article className="workflow-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Workflow position</p>
              <h2>Tickets by active stage</h2>
            </div>
            <span className="phase-chip">{health.records} total</span>
          </div>
          <div className="workflow-stages">
            {(Object.entries(health.stages) as Array<[string, number]>).map(([stage, count], index) => (
              <div className="workflow-stage" key={stage}>
                <div>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{stage}</strong>
                  <b>{count}</b>
                </div>
                <i><b style={{ width: `${(count / stageTotal) * 100}%` }} /></i>
                <small>{((count / stageTotal) * 100).toFixed(1)}% of selected records</small>
              </div>
            ))}
          </div>
        </article>

        <article className="stuck-summary-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Queue risk</p>
              <h2>Time-based stuck tickets</h2>
            </div>
            <span className={`stuck-count ${health.stuckTickets.length ? "risk" : ""}`}>{health.stuckTickets.length}</span>
          </div>
          <div className="stuck-rule">
            <span>Detection rule</span>
            <strong>Unresolved + no activity for more than 2 days</strong>
          </div>
          <div className="stage-risk-list">
            {["Intake", "In Progress", "Waiting"].map((stage) => {
              const count = health.stuckTickets.filter(
                (record) => record.workflowStage === stage,
              ).length;
              return (
                <div key={stage}>
                  <span>{stage}</span>
                  <b>{count} stuck</b>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="team-adoption-panel">
        <div className="section-title compact">
          <div>
            <p className="eyebrow">Cross-team system adoption</p>
            <h2>Where tool-usage gaps originate</h2>
          </div>
          <small>Click a team to focus the page</small>
        </div>
        <div className="table-scroll">
          <table className="team-adoption-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Records</th>
                <th>Required fields</th>
                <th>Category accuracy</th>
                <th>Workflow</th>
                <th>CRM linked</th>
                <th>Auto routing</th>
                <th>Knowledge</th>
                <th>Bypass</th>
                <th>Adoption score</th>
                <th>Stuck</th>
              </tr>
            </thead>
            <tbody>
              {teamHealth.map((item) => (
                <tr key={item.team} className={selectedProcessTeam === item.team ? "selected" : ""}>
                  <td><button onClick={() => setSelectedProcessTeam(item.team)}>{item.team}</button></td>
                  <td>{item.health.records}</td>
                  <td>{formatMetric(item.health.requiredFieldCompletionRate, "percent")}</td>
                  <td>{formatMetric(item.health.categorizationAccuracyRate, "percent")}</td>
                  <td>{formatMetric(item.health.workflowComplianceRate, "percent")}</td>
                  <td>{formatMetric(item.health.crmProfileLinkRate, "percent")}</td>
                  <td>{formatMetric(item.health.automatedRoutingRate, "percent")}</td>
                  <td>{formatMetric(item.health.knowledgeBaseUsageRate, "percent")}</td>
                  <td>{formatMetric(item.health.workflowBypassRate, "percent")}</td>
                  <td><span className={(item.health.overallSystemAdoptionScore ?? 0) >= 80 ? "table-good" : "table-risk"}>{formatMetric(item.health.overallSystemAdoptionScore, "percent")}</span></td>
                  <td><span className={item.health.stuckTickets.length ? "table-risk" : "table-good"}>{item.health.stuckTickets.length}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stuck-ticket-panel">
        <div className="section-title compact">
          <div>
            <p className="eyebrow">Aging detail</p>
            <h2>Tickets requiring ownership</h2>
          </div>
          <span className="phase-chip">Oldest first</span>
        </div>
        {health.stuckTickets.length ? (
          <div className="stuck-ticket-list">
            {health.stuckTickets.map((ticket) => (
              <article key={ticket.id}>
                <div>
                  <strong>{ticket.id}</strong>
                  <span>{ticket.inactiveDays} days inactive</span>
                </div>
                <h3>{ticket.category}</h3>
                <p>{ticket.team} · {ticket.agent} · {ticket.channel}</p>
                <div><span>{ticket.workflowStage}</span><b>{ticket.status}</b></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="process-all-clear">No unresolved tickets exceed the two-day inactivity threshold.</div>
        )}
      </section>

      <section className="process-actions">
        <div className="section-title compact">
          <div>
            <p className="eyebrow">Corrective actions</p>
            <h2>Recommendations by intervention type</h2>
          </div>
        </div>
        <div className="process-action-grid">
          {recommendations.map((action) => (
            <article className={action.type.toLowerCase()} key={action.title}>
              <span>{action.type}</span>
              <strong>{action.title}</strong>
              <p>{action.evidence}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function ReportsAndExcel({
  records,
  allRecords,
  onImport,
  onReset,
  periodLabel,
  filterSummary,
  sourceName,
  lastUpdated,
}: {
  records: TicketRecord[];
  allRecords: TicketRecord[];
  onImport: (records: TicketRecord[], sourceName: string) => void;
  onReset: () => void;
  periodLabel: string;
  filterSummary: string;
  sourceName: string;
  lastUpdated: string | null;
}) {
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const reportPeriods = buildReportPeriods(records, cadence);
  const reportKpis = calculateKpis(records);
  const requiredMapped = importFields.filter(
    (field) => field.required && mapping[field.key],
  ).length;
  const requiredTotal = importFields.filter((field) => field.required).length;

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setImportErrors([]);
    setImportWarnings([]);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: false,
      });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: "",
        raw: false,
      });
      const detectedHeaders = parsed.length ? Object.keys(parsed[0]) : [];
      setRawRows(parsed);
      setHeaders(detectedHeaders);
      setMapping(autoMapColumns(detectedHeaders));
      setFileName(file.name);
      setImportErrors(
        parsed.length
          ? []
          : ["The first worksheet does not contain any data rows."],
      );
      setImportedCount(null);
    } catch {
      setImportErrors(["The workbook could not be read. Confirm that it is a valid Excel or CSV file."]);
    } finally {
      setIsParsing(false);
    }
  };

  const applyImport = () => {
    const result = validateAndNormalizeRows(rawRows, mapping);
    setImportErrors(result.errors);
    if (result.records.length && !result.errors.length) {
      const missingCsat = result.records.filter((record) => record.csatScore === null).length;
      const missingResponse = result.records.filter((record) => record.firstResponseMinutes === null).length;
      setImportWarnings([
        ...(missingCsat ? [`${missingCsat} tickets have no CSAT response and are excluded from CSAT.`] : []),
        ...(missingResponse ? [`${missingResponse} tickets have no first-response value and are excluded from its average.`] : []),
      ]);
      onImport(result.records, fileName ?? "Imported spreadsheet");
      setImportedCount(result.records.length);
    } else {
      setImportedCount(null);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(toExportRows(tickets.slice(0, 6)));
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customer Service Data");
    XLSX.writeFile(workbook, "service-pulse-import-template.xlsx");
  };

  const downloadReport = async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    type Sheet = ReturnType<typeof XLSX.utils.aoa_to_sheet> & {
      "!cols"?: { wch: number }[];
      "!autofilter"?: { ref: string };
    };
    const percent = (value: number | null) => value === null ? null : value / 100;
    const setFormats = (sheet: Sheet, columns: Record<number, string>, startRow: number, endRow: number) => {
      Object.entries(columns).forEach(([column, format]) => {
        for (let row = startRow; row <= endRow; row += 1) {
          const address = XLSX.utils.encode_cell({ r: row - 1, c: Number(column) });
          if (sheet[address]) sheet[address].z = format;
        }
      });
    };
    const appendSheet = (
      name: string,
      title: string,
      subtitle: string,
      headers: string[],
      rows: (string | number | boolean | null)[][],
      widths: number[],
      formats: Record<number, string> = {},
    ) => {
      const sheet = XLSX.utils.aoa_to_sheet([
        [title],
        [subtitle],
        [],
        headers,
        ...rows,
      ]) as Sheet;
      sheet["!cols"] = widths.map((wch) => ({ wch }));
      if (rows.length) sheet["!autofilter"] = { ref: `A4:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 4}` };
      setFormats(sheet, formats, 5, rows.length + 4);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    };

    const summaryRows: (string | number | null)[][] = [
      ["Ticket volume", reportKpis.ticketCount, null, "Context", "Count of tickets in the selected reporting context."],
      ["CSAT", percent(reportKpis.csatPercent), .85, (reportKpis.csatPercent ?? 0) >= 85 ? "On target" : "Below target", "Share of valid responses scoring 4 or 5."],
      ["First response", reportKpis.averageFirstResponseMinutes, 15, (reportKpis.averageFirstResponseMinutes ?? Infinity) <= 15 ? "On target" : "Above target", "Average minutes to first response."],
      ["Handling time", reportKpis.averageHandlingMinutes, 30, (reportKpis.averageHandlingMinutes ?? Infinity) <= 30 ? "On target" : "Above target", "Average active handling minutes."],
      ["Resolution rate", percent(reportKpis.resolutionRate), .9, (reportKpis.resolutionRate ?? 0) >= 90 ? "On target" : "Below target", "Resolved tickets divided by all tickets."],
      ["First-contact resolution", percent(reportKpis.firstContactResolutionRate), .8, (reportKpis.firstContactResolutionRate ?? 0) >= 80 ? "On target" : "Below target", "Resolved without reopen or repeat contact."],
      ["SLA compliance", percent(reportKpis.slaComplianceRate), .9, (reportKpis.slaComplianceRate ?? 0) >= 90 ? "On target" : "Below target", "Eligible first responses completed within SLA."],
      ["Backlog", reportKpis.backlog, null, "Monitor", "Tickets not yet resolved."],
    ];
    appendSheet(
      "KPI Summary",
      "Service Pulse · Management KPI Summary",
      `Reporting context: ${filterSummary} | Source: ${sourceName}`,
      ["Metric", "Current value", "Target / benchmark", "Status", "Definition"],
      summaryRows,
      [27, 18, 20, 16, 58],
      { 1: "0.0", 2: "0.0" },
    );
    setFormats(workbook.Sheets["KPI Summary"] as Sheet, { 1: "0.0%", 2: "0.0%" }, 6, 6);
    setFormats(workbook.Sheets["KPI Summary"] as Sheet, { 1: "0.0%", 2: "0.0%" }, 9, 11);

    const periodRows = (periods: ReturnType<typeof buildReportPeriods>) => periods.map((period) => [
      period.period,
      period.kpis.ticketCount,
      percent(period.kpis.csatPercent),
      period.kpis.averageFirstResponseMinutes,
      period.kpis.averageHandlingMinutes,
      percent(period.kpis.resolutionRate),
      percent(period.kpis.firstContactResolutionRate),
      percent(period.kpis.slaComplianceRate),
      period.kpis.backlog,
    ]);
    const periodHeaders = ["Period", "Tickets", "CSAT", "First response (min)", "Handling (min)", "Resolution rate", "First-contact resolution", "SLA compliance", "Backlog"];
    const periodWidths = [18, 12, 13, 21, 17, 18, 25, 18, 12];
    const periodFormats = { 1: "#,##0", 2: "0.0%", 3: "0.0", 4: "0.0", 5: "0.0%", 6: "0.0%", 7: "0.0%", 8: "#,##0" };
    appendSheet("Weekly Review", "Service Pulse · Weekly Business Review", filterSummary, periodHeaders, periodRows(buildReportPeriods(records, "weekly")), periodWidths, periodFormats);
    appendSheet("Monthly Review", "Service Pulse · Monthly Business Review", filterSummary, periodHeaders, periodRows(buildReportPeriods(records, "monthly")), periodWidths, periodFormats);

    const pivotRows = buildPivotSummary(records).map((row) => [
      row.dimension, row.value, row.tickets, percent(row.csatPercent), row.firstResponseMinutes,
      row.handlingMinutes, percent(row.resolutionRate), percent(row.firstContactResolutionRate),
      percent(row.slaComplianceRate), row.backlog,
    ]);
    appendSheet(
      "Pivot Summary",
      "Service Pulse · Pivot-style Performance Summary",
      "Use Excel filters to compare teams, channels, and issue categories.",
      ["Dimension", "Value", "Tickets", "CSAT", "First response (min)", "Handling (min)", "Resolution rate", "First-contact resolution", "SLA compliance", "Backlog"],
      pivotRows,
      [19, 24, 12, 13, 21, 17, 18, 25, 18, 12],
      { 2: "#,##0", 3: "0.0%", 4: "0.0", 5: "0.0", 6: "0.0%", 7: "0.0%", 8: "0.0%", 9: "#,##0" },
    );

    appendSheet(
      "Metric Definitions",
      "Service Pulse · Metric Definitions",
      "Definitions make calculations consistent across weekly and monthly reviews.",
      ["Metric", "Definition", "Calculation", "Preferred direction"],
      metricDefinitions.map((row) => [row.metric, row.definition, row.calculation, row.preferredDirection]),
      [28, 62, 54, 22],
    );
    appendSheet(
      "Data Dictionary",
      "Service Pulse · Data Dictionary",
      "Field-level guide for preparing imports and interpreting raw records.",
      ["Field", "Display label", "Import requirement", "Description"],
      reportDataDictionary.map((row) => [row.field, row.label, row.requiredForImport, row.description]),
      [28, 31, 21, 70],
    );

    const rawRows = toExportRows(records);
    const rawSheet = XLSX.utils.json_to_sheet(rawRows) as Sheet;
    rawSheet["!cols"] = Object.keys(rawRows[0] ?? {}).map((key) => ({ wch: Math.min(28, Math.max(12, key.length + 2)) }));
    if (rawRows.length) rawSheet["!autofilter"] = { ref: rawSheet["!ref"] ?? "A1:A1" };
    XLSX.utils.book_append_sheet(workbook, rawSheet, "Raw Records");

    XLSX.writeFile(workbook, "service-pulse-management-report.xlsx", { compression: true });
  };

  return (
    <>
      <section className="reports-heading">
        <div>
          <p className="eyebrow">Reports & Excel workflow · {periodLabel}</p>
          <h2>Keep Excel familiar—make the decisions faster.</h2>
          <p>Import operational files, validate quality, review recurring performance, and export a management-ready workbook.</p>
        </div>
        <div className="data-source-status">
          <span>Active data source</span>
          <strong>{sourceName}</strong>
          <small>{allRecords.length} records available across the application</small>
          {lastUpdated && <small>Last updated {new Date(lastUpdated).toLocaleString("en-MY")}</small>}
        </div>
      </section>

      <section className="excel-actions-grid">
        <article className="upload-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Step 1 · Import</p>
              <h2>Upload an Excel or CSV file</h2>
            </div>
            <span className="file-types">.xlsx · .xls · .csv</span>
          </div>
          <label
            className={`upload-zone ${isParsing ? "is-loading" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <span className="upload-mark">{isParsing ? "…" : "↑"}</span>
            <strong>{isParsing ? "Reading and checking your workbook…" : fileName ?? "Choose or drop a customer-service file"}</strong>
            <small>The first worksheet will be used. Your file stays in this browser session.</small>
          </label>
          <div className="upload-actions">
            <button onClick={() => void downloadTemplate()}>Download Excel template</button>
            <button className="quiet" onClick={() => {
              onReset();
              setImportedCount(null);
              setFileName(null);
              setRawRows([]);
              setHeaders([]);
              setImportErrors([]);
              setImportWarnings([]);
            }}>{lastUpdated ? "Remove imported data" : "Restore demo data"}</button>
          </div>
        </article>

        <article className="quality-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Data-quality check</p>
              <h2>Import readiness</h2>
            </div>
            <span className={`quality-state ${importErrors.length ? "risk" : importedCount ? "ready" : ""}`}>
              {importErrors.length ? "Action needed" : importedCount ? "Imported" : "Waiting"}
            </span>
          </div>
          <div className="quality-summary-grid">
            <div><span>Rows detected</span><strong>{rawRows.length || "—"}</strong></div>
            <div><span>Required mappings</span><strong>{requiredMapped}/{requiredTotal}</strong></div>
            <div><span>Valid imported</span><strong>{importedCount ?? "—"}</strong></div>
          </div>
          <div className="import-message">
            {importErrors.length ? (
              <ul>{importErrors.slice(0, 4).map((error) => <li key={error}>{error}</li>)}</ul>
            ) : importedCount ? (
              <p>{importedCount} records now power every dashboard and report.</p>
            ) : (
              <p>Upload a file to inspect its columns before changing the active dataset.</p>
            )}
          </div>
          {importWarnings.length > 0 && (
            <div className="import-warnings">
              <strong>Imported with informational notes</strong>
              {importWarnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}
        </article>
      </section>

      {headers.length > 0 && (
        <section className="mapping-panel">
          <div className="section-title compact">
            <div>
              <p className="eyebrow">Step 2 · Map and validate</p>
              <h2>Connect spreadsheet columns to dashboard fields</h2>
            </div>
            <button className="apply-import-button" onClick={applyImport}>Validate & use data</button>
          </div>
          <div className="mapping-grid">
            {importFields.map((field) => (
              <label key={field.key}>
                <span>{field.label}{field.required ? " *" : ""}</span>
                <select
                  value={mapping[field.key] ?? ""}
                  onChange={(event) =>
                    setMapping((current) => ({
                      ...current,
                      [field.key]: event.target.value || undefined,
                    }))
                  }
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => <option key={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="mapping-note">Fields marked * are required. Optional fields use safe defaults when they are not mapped.</p>
        </section>
      )}

      <section className="business-review-panel">
        <div className="review-toolbar">
          <div>
            <p className="eyebrow">Recurring business review</p>
            <h2>Performance by reporting period</h2>
          </div>
          <div className="review-controls">
            <div className="cadence-toggle">
              <button className={cadence === "weekly" ? "active" : ""} onClick={() => setCadence("weekly")}>Weekly</button>
              <button className={cadence === "monthly" ? "active" : ""} onClick={() => setCadence("monthly")}>Monthly</button>
            </div>
            <button className="export-report-button" onClick={() => void downloadReport()}>Export full Excel report</button>
          </div>
        </div>
        <div className="workbook-contents" aria-label="Exported workbook contents">
          <strong>Workbook includes</strong>
          <span>KPI summary</span><span>Pivot summary</span><span>Weekly review</span><span>Monthly review</span><span>Metric definitions</span><span>Data dictionary</span><span>Raw records</span>
        </div>
        <div className="review-kpi-strip">
          <div><span>Tickets</span><strong>{reportKpis.ticketCount}</strong></div>
          <div><span>CSAT</span><strong>{formatMetric(reportKpis.csatPercent, "percent")}</strong></div>
          <div><span>First response</span><strong>{formatMetric(reportKpis.averageFirstResponseMinutes, "minutes")}</strong></div>
          <div><span>Resolution</span><strong>{formatMetric(reportKpis.resolutionRate, "percent")}</strong></div>
          <div><span>SLA</span><strong>{formatMetric(reportKpis.slaComplianceRate, "percent")}</strong></div>
          <div><span>Backlog</span><strong>{reportKpis.backlog}</strong></div>
        </div>
        <div className="report-context-banner"><strong>Active report context</strong><span>{filterSummary}</span></div>
        <div className="table-scroll">
          <table className="business-review-table">
            <thead>
              <tr>
                <th>{cadence === "weekly" ? "Week commencing" : "Month"}</th>
                <th>Tickets</th>
                <th>CSAT</th>
                <th>First response</th>
                <th>Handling</th>
                <th>Resolution</th>
                <th>SLA</th>
                <th>Backlog</th>
              </tr>
            </thead>
            <tbody>
              {reportPeriods.map((period) => (
                <tr
                  key={period.period}
                  className={selectedPeriod === period.period ? "selected" : ""}
                  onClick={() => setSelectedPeriod(period.period)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedPeriod(period.period);
                  }}
                >
                  <td>{period.period}</td>
                  <td>{period.kpis.ticketCount}</td>
                  <td>{formatMetric(period.kpis.csatPercent, "percent")}</td>
                  <td>{formatMetric(period.kpis.averageFirstResponseMinutes, "minutes")}</td>
                  <td>{formatMetric(period.kpis.averageHandlingMinutes, "minutes")}</td>
                  <td>{formatMetric(period.kpis.resolutionRate, "percent")}</td>
                  <td>{formatMetric(period.kpis.slaComplianceRate, "percent")}</td>
                  <td>{period.kpis.backlog}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedPeriod && (
          <div className="selected-period-note">
            <strong>{selectedPeriod} selected</strong>
            <span>Use this row to discuss the period’s movement, then export the filtered workbook for management review.</span>
            <button onClick={() => setSelectedPeriod(null)}>Clear selection</button>
          </div>
        )}
        <p className="report-filter-note">The exported workbook uses the active period, team, channel, and issue-category filters shown above.</p>
      </section>
      {importedCount && !importErrors.length ? (
        <div className="success-toast" role="status">
          <strong>Import successful</strong>
          <span>{importedCount} records · {allRecords[0]?.createdAt} to {allRecords[allRecords.length - 1]?.createdAt} · Every dashboard updated</span>
        </div>
      ) : null}
    </>
  );
}

function TicketDrilldown({
  title,
  records,
  onClose,
}: {
  title: string;
  records: TicketRecord[];
  onClose: () => void;
}) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="ticket-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drilldown-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-heading">
          <div>
            <p className="eyebrow">KPI drill-down</p>
            <h2 id="drilldown-title">{title}</h2>
            <span>{records.length} contributing tickets</span>
          </div>
          <button aria-label="Close ticket details" onClick={onClose}>×</button>
        </div>
        {records.length ? (
          <div className="drawer-ticket-list">
            {records.slice(0, 100).map((record) => (
              <article key={record.id}>
                <div><strong>{record.id}</strong><span className={`ticket-status ${record.status.toLowerCase()}`}>{record.status}</span></div>
                <p>{record.category} · {record.team}</p>
                <small>{record.createdAt} · {record.channel} · {record.agent}</small>
                <div className="drawer-ticket-metrics">
                  <span>CSAT <b>{record.csatScore ?? "—"}</b></span>
                  <span>Response <b>{record.firstResponseMinutes === null ? "—" : `${record.firstResponseMinutes} min`}</b></span>
                  <span>SLA <b>{record.slaTargetMinutes} min</b></span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="drawer-empty"><strong>No contributing tickets</strong><p>The selected KPI has no exceptions under the active filters.</p></div>
        )}
      </aside>
    </div>
  );
}

function UpcomingPage({
  item,
}: {
  item: (typeof navigation)[number];
}) {
  return (
    <section className="upcoming-page">
      <span className="upcoming-number">0{item.phase}</span>
      <p className="eyebrow">Planned phase {item.phase}</p>
      <h2>{item.label}</h2>
      <p>
        The navigation destination is connected and inherits the shared filter
        context. Its analytical components will be added only after the prior
        phase passes review.
      </p>
      <div className="upcoming-context">
        <span className="status-dot" />
        Waiting for the Phase {item.phase - 1} quality gate
      </div>
    </section>
  );
}
