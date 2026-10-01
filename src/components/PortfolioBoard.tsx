"use client";
import { useEffect, useState } from "react";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import { Landmark, Loader2 } from "lucide-react";

type RoadmapStatus = { impact: string; effort: string; quickWin: boolean; rationale: string | null } | null;
type Decision = {
  id: string;
  decisionType: "FUND" | "DEFER" | "HOLD" | "KILL";
  budgetRequested: number | null;
  budgetApproved: number | null;
  rationale: string | null;
  decidedBy: string;
  decidedAt: string;
};
type BoardItem = {
  id: string;
  name: string;
  stage: string;
  priority: string;
  autoRag: string;
  budgetPlanned: number | null;
  budgetActual: number | null;
  percentComplete: number;
  roadmap: RoadmapStatus;
  latestDecision: Decision | null;
};
type BoardView = {
  items: BoardItem[];
  totalBudgetPlanned: number;
  totalBudgetActual: number;
  byRag: Record<string, number>;
  byDecisionType: Record<string, number>;
};

const DECISION_LABELS: Record<Decision["decisionType"], string> = { FUND: "Funded", DEFER: "Deferred", HOLD: "On hold", KILL: "Killed" };
const DECISION_CLS: Record<Decision["decisionType"], string> = {
  FUND: "bg-emerald-100 text-emerald-700",
  DEFER: "bg-amber-100 text-amber-700",
  HOLD: "bg-slate-100 text-slate-600",
  KILL: "bg-rose-100 text-rose-700",
};

// Portfolio Board decision log -- "who got funded, deferred, held, or killed, by whom, and
// why", across the whole visible portfolio. Reads from lib/portfolioBoard.ts, which reuses
// getPortfolioSummary()/getLatestRoadmapStatusForProjects() rather than re-deriving project
// health, so this stays consistent with every other portfolio view in the app. canDecide is
// whether the current user holds SUPER_USER+ (passed down so the page doesn't need a second
// role check) -- everyone PM+ can see the board, only SUPER_USER+ can record a decision.
export default function PortfolioBoard({ canDecide }: { canDecide: boolean }) {
  const [data, setData] = useState<BoardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [decidingFor, setDecidingFor] = useState<string | null>(null);
  const [form, setForm] = useState<{ decisionType: Decision["decisionType"]; budgetRequested: string; budgetApproved: string; rationale: string }>({
    decisionType: "FUND",
    budgetRequested: "",
    budgetApproved: "",
    rationale: "",
  });
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/portfolio-board")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function submitDecision(projectId: string) {
    setSaving(true);
    await fetch("/api/portfolio-board/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        decisionType: form.decisionType,
        budgetRequested: form.budgetRequested ? Number(form.budgetRequested) : null,
        budgetApproved: form.budgetApproved ? Number(form.budgetApproved) : null,
        rationale: form.rationale.trim() || null,
      }),
    });
    setSaving(false);
    setDecidingFor(null);
    setForm({ decisionType: "FUND", budgetRequested: "", budgetApproved: "", rationale: "" });
    load();
  }

  if (loading) {
    return <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading portfolio board...</p>;
  }
  if (!data) return <p className="text-sm text-rose-600">Couldn&apos;t load the portfolio board.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Funded" value={data.byDecisionType.FUND ?? 0} />
        <SummaryCard label="Deferred" value={data.byDecisionType.DEFER ?? 0} />
        <SummaryCard label="On hold / killed" value={(data.byDecisionType.HOLD ?? 0) + (data.byDecisionType.KILL ?? 0)} />
        <SummaryCard label="Undecided" value={data.byDecisionType.UNDECIDED ?? 0} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2.5 px-4 font-medium">Project</th>
              <th className="py-2.5 px-2 font-medium">Stage</th>
              <th className="py-2.5 px-2 font-medium">Priority</th>
              <th className="py-2.5 px-2 font-medium">Health</th>
              <th className="py-2.5 px-2 font-medium">Budget (planned / actual)</th>
              <th className="py-2.5 px-2 font-medium">Roadmap</th>
              <th className="py-2.5 px-2 font-medium">Decision</th>
              {canDecide && <th className="py-2.5 px-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2.5 px-4 font-medium text-slate-800">{item.name}</td>
                <td className="py-2.5 px-2"><StageBadge stage={item.stage} /></td>
                <td className="py-2.5 px-2"><PriorityBadge priority={item.priority} /></td>
                <td className="py-2.5 px-2"><RagBadge rag={item.autoRag} /></td>
                <td className="py-2.5 px-2 text-slate-600 whitespace-nowrap">
                  ${(item.budgetPlanned ?? 0).toLocaleString()} / ${(item.budgetActual ?? 0).toLocaleString()}
                </td>
                <td className="py-2.5 px-2 text-xs text-slate-500">
                  {item.roadmap ? `${item.roadmap.quickWin ? "Quick win · " : ""}${item.roadmap.impact} impact` : "—"}
                </td>
                <td className="py-2.5 px-2">
                  {item.latestDecision ? (
                    <div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${DECISION_CLS[item.latestDecision.decisionType]}`}>
                        {DECISION_LABELS[item.latestDecision.decisionType]}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5">by {item.latestDecision.decidedBy} · {new Date(item.latestDecision.decidedAt).toLocaleDateString()}</p>
                      {item.latestDecision.rationale && <p className="text-xs text-slate-500 mt-0.5 max-w-xs">{item.latestDecision.rationale}</p>}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Undecided</span>
                  )}
                </td>
                {canDecide && (
                  <td className="py-2.5 px-2">
                    {decidingFor === item.id ? (
                      <div className="w-56 space-y-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2">
                        <select
                          value={form.decisionType}
                          onChange={(e) => setForm((f) => ({ ...f, decisionType: e.target.value as Decision["decisionType"] }))}
                          className="w-full text-xs border border-slate-200 rounded-md px-1.5 py-1"
                        >
                          {(["FUND", "DEFER", "HOLD", "KILL"] as const).map((d) => <option key={d} value={d}>{DECISION_LABELS[d]}</option>)}
                        </select>
                        <input
                          type="number"
                          placeholder="Budget approved ($)"
                          value={form.budgetApproved}
                          onChange={(e) => setForm((f) => ({ ...f, budgetApproved: e.target.value }))}
                          className="w-full text-xs border border-slate-200 rounded-md px-1.5 py-1"
                        />
                        <textarea
                          placeholder="Rationale"
                          value={form.rationale}
                          onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
                          rows={2}
                          className="w-full text-xs border border-slate-200 rounded-md px-1.5 py-1"
                        />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => submitDecision(item.id)}
                            disabled={saving}
                            className="flex-1 text-xs font-medium px-2 py-1 rounded-md bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Record"}
                          </button>
                          <button onClick={() => setDecidingFor(null)} className="text-xs px-2 py-1 rounded-md text-slate-500 hover:bg-slate-100">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDecidingFor(item.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-accent-50 text-accent-600 hover:bg-accent-100"
                      >
                        <Landmark size={12} /> Decide
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr><td colSpan={canDecide ? 8 : 7} className="py-8 text-center text-slate-400">No projects visible to score.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
    </div>
  );
}
