"use client";
import { useEffect, useState } from "react";
import type { ProjectDetail } from "./ProjectTabs";
import type { SessionUser } from "@/lib/auth";
import { Card, inputCls, PrimaryButton } from "./ui";
import {
  Sparkles, Loader2, ChevronDown, ChevronUp, Trash2, Plus, FileText, ClipboardCheck,
  Gauge, CheckCircle2, AlertTriangle, XCircle, ListChecks,
} from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

type TestCase = {
  id: string;
  sequence: number;
  scenario: string;
  steps: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  status: string;
  executedBy: string | null;
  executedAt: string | null;
  notes: string | null;
};

type Deliverable = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  status: string;
  createdByAi: boolean;
  createdBy: string | null;
  createdAt: string;
  testCases: TestCase[];
};

type ReadinessCounts = { total: number; pass: number; fail: number; blocked: number; notRun: number };
type ReadinessBreakdownRow = { deliverableId: string; title: string; type: string; total: number; passed: number; failed: number; blocked: number };
type ReadinessVerdict = { verdict: "READY" | "AT_RISK" | "NOT_READY"; summary: string; topBlockers: string[] };

type TraceItem = {
  item: string;
  covered: boolean;
  matchingTaskTitle?: string;
  suggestedTaskTitle?: string;
  suggestedDescription?: string;
};

const TYPES: { value: string; label: string; description: string; isTest: boolean }[] = [
  { value: "REQUIREMENTS_NFR", label: "Requirements & NFR", description: "Detailed functional requirements + non-functional requirements for the confirmed scope.", isTest: false },
  { value: "DESIGN", label: "Detailed Design", description: "Key components to be developed, their responsibilities, and how they interact.", isTest: false },
  { value: "FUNCTIONAL_TEST_SCRIPT", label: "Functional Test Script", description: "Executable test cases verifying the product works as specified.", isTest: true },
  { value: "UAT_SCRIPT", label: "UAT Script", description: "Business-facing acceptance scenarios, with results captured as they're run.", isTest: true },
  { value: "RELEASE_DOCUMENTATION", label: "Release Documentation", description: "Release checklist, deployment/rollback steps, sign-offs, and documentation checklist.", isTest: false },
];

const TRACEABLE_TYPES = new Set(["REQUIREMENTS_NFR", "DESIGN"]);

const DELIVERABLE_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "FINAL"];
const TEST_CASE_STATUSES = ["NOT_RUN", "PASS", "FAIL", "BLOCKED"];

const TEST_STATUS_STYLES: Record<string, string> = {
  NOT_RUN: "bg-slate-100 text-slate-500",
  PASS: "bg-emerald-50 text-emerald-700",
  FAIL: "bg-rose-50 text-rose-700",
  BLOCKED: "bg-amber-50 text-amber-700",
};

const VERDICT_STYLES: Record<string, { badge: string; icon: React.ReactNode }> = {
  READY: { badge: "bg-emerald-50 text-emerald-700", icon: <CheckCircle2 size={14} /> },
  AT_RISK: { badge: "bg-amber-50 text-amber-700", icon: <AlertTriangle size={14} /> },
  NOT_READY: { badge: "bg-rose-50 text-rose-700", icon: <XCircle size={14} /> },
};

export default function DeliverablesTab({ detail, user }: { detail: ProjectDetail; user?: SessionUser | null }) {
  const canEdit = !user || user.role !== "VIEWER";
  const projectId = detail.project.id;

  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Test-result-driven release readiness: counts load automatically (cheap, no AI); the
  // verdict/summary is a separate explicit AI call triggered by a button.
  const [readinessCounts, setReadinessCounts] = useState<ReadinessCounts | null>(null);
  const [readinessBreakdown, setReadinessBreakdown] = useState<ReadinessBreakdownRow[]>([]);
  const [assessingReadiness, setAssessingReadiness] = useState(false);
  const [readinessVerdict, setReadinessVerdict] = useState<ReadinessVerdict | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  // Deliverable-to-task traceability: keyed by deliverable id.
  const [tracingId, setTracingId] = useState<string | null>(null);
  const [traceResults, setTraceResults] = useState<Record<string, TraceItem[]>>({});
  const [traceError, setTraceError] = useState<string | null>(null);
  const [creatingTaskFor, setCreatingTaskFor] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [res, readinessRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/deliverables`),
      fetch(`/api/projects/${projectId}/release-readiness`),
    ]);
    const data = await res.json().catch(() => []);
    setDeliverables(Array.isArray(data) ? data : []);
    if (readinessRes.ok) {
      const r = await readinessRes.json();
      setReadinessCounts(r.counts ?? null);
      setReadinessBreakdown(Array.isArray(r.breakdown) ? r.breakdown : []);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function generate(type: string) {
    setGeneratingType(type);
    setGenError(null);
    try {
      const res = await fetch("/api/ai/draft-deliverable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, type }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data?.error ?? "Couldn't generate this deliverable.");
        return;
      }
      await load();
      setExpandedId(data.id);
    } finally {
      setGeneratingType(null);
    }
  }

  async function updateDeliverable(id: string, patch: Partial<Pick<Deliverable, "title" | "content" | "status">>) {
    setDeliverables((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    await fetch(`/api/deliverables/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function removeDeliverable(id: string) {
    if (!confirm("Delete this deliverable? This cannot be undone.")) return;
    await fetch(`/api/deliverables/${id}`, { method: "DELETE" });
    load();
  }

  async function updateTestCase(deliverableId: string, caseId: string, patch: Partial<TestCase>) {
    setDeliverables((prev) =>
      prev.map((d) =>
        d.id !== deliverableId ? d : { ...d, testCases: d.testCases.map((tc) => (tc.id === caseId ? { ...tc, ...patch } : tc)) }
      )
    );
    await fetch(`/api/deliverables/${deliverableId}/test-cases/${caseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    // Test result counts feed the release-readiness card, so refresh it after any status change.
    fetch(`/api/projects/${projectId}/release-readiness`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (!r) return;
        setReadinessCounts(r.counts ?? null);
        setReadinessBreakdown(Array.isArray(r.breakdown) ? r.breakdown : []);
      })
      .catch(() => {});
  }

  async function addTestCase(deliverableId: string) {
    const scenario = prompt("Test case name / scenario:");
    if (!scenario?.trim()) return;
    const res = await fetch(`/api/deliverables/${deliverableId}/test-cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    if (res.ok) load();
  }

  async function removeTestCase(deliverableId: string, caseId: string) {
    await fetch(`/api/deliverables/${deliverableId}/test-cases/${caseId}`, { method: "DELETE" });
    load();
  }

  async function assessReadiness() {
    setAssessingReadiness(true);
    setReadinessError(null);
    try {
      const res = await fetch("/api/ai/release-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReadinessError(data?.error ?? "Couldn't assess readiness.");
        return;
      }
      setReadinessVerdict(data);
    } finally {
      setAssessingReadiness(false);
    }
  }

  async function checkCoverage(deliverableId: string) {
    setTracingId(deliverableId);
    setTraceError(null);
    try {
      const res = await fetch("/api/ai/trace-deliverable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliverableId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTraceError(data?.error ?? "Couldn't check task coverage.");
        return;
      }
      setTraceResults((prev) => ({ ...prev, [deliverableId]: data.items ?? [] }));
    } finally {
      setTracingId(null);
    }
  }

  async function createTaskFromItem(deliverableId: string, item: TraceItem) {
    if (!item.suggestedTaskTitle) return;
    setCreatingTaskFor(item.suggestedTaskTitle);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.suggestedTaskTitle, description: item.suggestedDescription ?? null }),
      });
      if (res.ok) {
        setTraceResults((prev) => ({
          ...prev,
          [deliverableId]: (prev[deliverableId] ?? []).map((i) =>
            i === item ? { ...i, covered: true, matchingTaskTitle: item.suggestedTaskTitle } : i
          ),
        }));
      }
    } finally {
      setCreatingTaskFor(null);
    }
  }

  const hasTestData = readinessCounts && readinessCounts.total > 0;

  return (
    <div className="max-w-4xl space-y-4">
      {hasTestData && (
        <Card
          title="Release readiness"
          action={
            canEdit ? (
              <button
                onClick={assessReadiness}
                disabled={assessingReadiness}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 font-medium"
              >
                {assessingReadiness ? <Loader2 size={13} className="animate-spin" /> : <Gauge size={13} />}
                {assessingReadiness ? "Assessing..." : "Assess with AI"}
              </button>
            ) : undefined
          }
        >
          <div className="flex flex-wrap gap-3 mb-3 text-xs">
            <span className="text-slate-500">{readinessCounts!.total} test cases</span>
            <span className="text-emerald-700">{readinessCounts!.pass} passed</span>
            <span className="text-rose-700">{readinessCounts!.fail} failed</span>
            <span className="text-amber-700">{readinessCounts!.blocked} blocked</span>
            <span className="text-slate-400">{readinessCounts!.notRun} not run</span>
          </div>
          <AiWaitIndicator active={assessingReadiness} messages={["Reading test results...", "Weighing readiness..."]} />
          {readinessError && <p className="text-xs text-rose-600 mt-2">{readinessError}</p>}
          {readinessVerdict && (
            <div className="mt-2 border border-slate-200 rounded-lg p-3 space-y-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 ${VERDICT_STYLES[readinessVerdict.verdict]?.badge ?? ""}`}>
                {VERDICT_STYLES[readinessVerdict.verdict]?.icon}
                {readinessVerdict.verdict.replace("_", " ")}
              </span>
              <p className="text-xs text-slate-600">{readinessVerdict.summary}</p>
              {readinessVerdict.topBlockers.length > 0 && (
                <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                  {readinessVerdict.topBlockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              )}
            </div>
          )}
          {readinessBreakdown.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
              {readinessBreakdown.map((row) => (
                <p key={row.deliverableId} className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{row.title}</span>: {row.passed}/{row.total} passed
                  {row.failed > 0 ? `, ${row.failed} failed` : ""}
                  {row.blocked > 0 ? `, ${row.blocked} blocked` : ""}
                </p>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="Generate a deliverable">
        <p className="text-xs text-slate-400 mb-3">
          AI drafts each of these from this project&apos;s charter, scope, and task plan — review and edit
          before treating anything as final. Generating again creates a new version alongside any existing one.
        </p>
        {genError && <p className="text-xs text-rose-600 mb-3">{genError}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TYPES.map((t) => (
            <div key={t.value} className="border border-slate-200 rounded-lg p-3">
              <p className="text-sm font-medium text-slate-800">{t.label}</p>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">{t.description}</p>
              {canEdit && (
                <button
                  onClick={() => generate(t.value)}
                  disabled={generatingType !== null}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 font-medium"
                >
                  {generatingType === t.value ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {generatingType === t.value ? "Generating..." : "Generate with AI"}
                </button>
              )}
              {generatingType === t.value && (
                <AiWaitIndicator
                  active
                  className="mt-2"
                  messages={t.isTest ? ["Reading the scope...", "Writing test cases..."] : ["Reading the charter and plan...", "Writing the document..."]}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title={`Deliverables (${deliverables.length})`}>
        <div className="space-y-2">
          {deliverables.map((d) => {
            const typeInfo = TYPES.find((t) => t.value === d.type);
            const expanded = expandedId === d.id;
            const traceable = TRACEABLE_TYPES.has(d.type);
            const trace = traceResults[d.id];
            return (
              <div key={d.id} className="border border-slate-100 rounded-lg">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <button onClick={() => setExpandedId(expanded ? null : d.id)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                    {expanded ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{d.title}</p>
                      <p className="text-xs text-slate-400">
                        {typeInfo?.label ?? d.type}
                        {d.createdByAi ? " · AI generated" : ""}
                        {d.testCases.length > 0 ? ` · ${d.testCases.length} test cases` : ""}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    {canEdit ? (
                      <select
                        value={d.status}
                        onChange={(e) => updateDeliverable(d.id, { status: e.target.value })}
                        className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                      >
                        {DELIVERABLE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-500 bg-slate-50 rounded-full px-2 py-0.5">{d.status.replace("_", " ")}</span>
                    )}
                    {canEdit && (
                      <button onClick={() => removeDeliverable(d.id)} className="text-slate-400 hover:text-rose-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-slate-100 px-3 py-3">
                    {d.testCases.length > 0 || typeInfo?.isTest ? (
                      <TestCaseTable
                        deliverableId={d.id}
                        testCases={d.testCases}
                        canEdit={canEdit}
                        onUpdate={(caseId, patch) => updateTestCase(d.id, caseId, patch)}
                        onAdd={() => addTestCase(d.id)}
                        onRemove={(caseId) => removeTestCase(d.id, caseId)}
                      />
                    ) : (
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1"><FileText size={12} /> Content</p>
                        {canEdit ? (
                          <textarea
                            value={d.content ?? ""}
                            onChange={(e) => setDeliverables((prev) => prev.map((x) => (x.id === d.id ? { ...x, content: e.target.value } : x)))}
                            onBlur={(e) => updateDeliverable(d.id, { content: e.target.value })}
                            className={inputCls}
                            rows={14}
                          />
                        ) : (
                          <pre className="whitespace-pre-wrap font-sans text-xs text-slate-600 bg-slate-50 rounded-lg p-3">{d.content}</pre>
                        )}
                      </div>
                    )}

                    {traceable && canEdit && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-slate-500 flex items-center gap-1"><ListChecks size={12} /> Task coverage</p>
                          <button
                            onClick={() => checkCoverage(d.id)}
                            disabled={tracingId === d.id}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 font-medium"
                          >
                            {tracingId === d.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                            {tracingId === d.id ? "Checking..." : "Check task coverage"}
                          </button>
                        </div>
                        <AiWaitIndicator active={tracingId === d.id} messages={["Reading the document...", "Comparing against tasks..."]} />
                        {traceError && tracingId === null && <p className="text-xs text-rose-600">{traceError}</p>}
                        {trace && (
                          <div className="space-y-1.5">
                            {trace.map((item, i) => (
                              <div key={i} className="flex items-start justify-between gap-2 text-xs border border-slate-100 rounded-lg px-2.5 py-2">
                                <div className="min-w-0">
                                  <p className="text-slate-700">{item.item}</p>
                                  {item.covered ? (
                                    <p className="text-emerald-600 mt-0.5">Covered by &quot;{item.matchingTaskTitle}&quot;</p>
                                  ) : (
                                    <p className="text-amber-600 mt-0.5">No task yet — suggested: &quot;{item.suggestedTaskTitle}&quot;</p>
                                  )}
                                </div>
                                {item.covered ? (
                                  <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                ) : (
                                  <button
                                    onClick={() => createTaskFromItem(d.id, item)}
                                    disabled={creatingTaskFor === item.suggestedTaskTitle}
                                    className="text-indigo-600 hover:text-indigo-700 shrink-0 whitespace-nowrap"
                                  >
                                    {creatingTaskFor === item.suggestedTaskTitle ? "Adding..." : "+ Create task"}
                                  </button>
                                )}
                              </div>
                            ))}
                            {trace.length === 0 && <p className="text-xs text-slate-400">No distinct requirements found to check.</p>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && deliverables.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No deliverables yet — generate one above.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function TestCaseTable({
  testCases,
  canEdit,
  onUpdate,
  onAdd,
  onRemove,
}: {
  deliverableId: string;
  testCases: TestCase[];
  canEdit: boolean;
  onUpdate: (caseId: string, patch: Partial<TestCase>) => void;
  onAdd: () => void;
  onRemove: (caseId: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 flex items-center gap-1"><ClipboardCheck size={12} /> Test cases</p>
        {canEdit && (
          <button onClick={onAdd} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700">
            <Plus size={12} /> Add test case
          </button>
        )}
      </div>
      <div className="space-y-2">
        {testCases.sort((a, b) => a.sequence - b.sequence).map((tc) => (
          <div key={tc.id} className="border border-slate-100 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{tc.scenario}</p>
                {tc.steps && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{tc.steps}</p>}
                {tc.expectedResult && <p className="text-xs text-slate-400 mt-1"><span className="font-medium">Expected:</span> {tc.expectedResult}</p>}
              </div>
              <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${TEST_STATUS_STYLES[tc.status] ?? TEST_STATUS_STYLES.NOT_RUN}`}>
                {tc.status.replace("_", " ")}
              </span>
            </div>
            {canEdit && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={tc.status}
                  onChange={(e) => onUpdate(tc.id, { status: e.target.value })}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white"
                >
                  {TEST_CASE_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                </select>
                <input
                  placeholder="Actual result"
                  defaultValue={tc.actualResult ?? ""}
                  onBlur={(e) => onUpdate(tc.id, { actualResult: e.target.value })}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1.5"
                />
              </div>
            )}
            {(tc.executedBy || canEdit) && (
              <div className="flex items-center justify-between mt-1.5">
                {tc.executedBy && (
                  <p className="text-[10px] text-slate-400">
                    Last run by {tc.executedBy}{tc.executedAt ? ` on ${new Date(tc.executedAt).toLocaleDateString()}` : ""}
                  </p>
                )}
                {canEdit && (
                  <button onClick={() => onRemove(tc.id)} className="text-[10px] text-slate-400 hover:text-rose-600 ml-auto">
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {testCases.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No test cases yet.</p>}
      </div>
    </div>
  );
}
