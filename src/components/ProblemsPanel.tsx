"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Layers, ClipboardList } from "lucide-react";
import { computeIncidentInsights, type InsightIncident } from "@/lib/incidentInsights";
import { formatMinutes } from "@/lib/incidentSla";

type Problem = {
  id: string; title: string; description: string | null; status: string; projectId: string | null;
  rootCause: string | null; workaround: string | null; runbook: string | null; permanentFix: string | null; fixTaskId: string | null;
};
type Candidate = { key: string; incidentIds: string[]; titles: string[] };
type RawIncident = {
  id: string; severity: string; status: string; reportedAt: string; acknowledgedAt: string | null; resolvedAt: string | null;
  assigneeUserId: string | null; reporterEmail?: string | null; slaWarnedAt?: string | null; slaBreachedAt?: string | null;
  lastReporterUpdateAt?: string | null; problemId?: string | null;
};

const d = (s: string | null | undefined) => (s ? new Date(s) : null);
const STATUS_CLS: Record<string, string> = {
  INVESTIGATING: "bg-amber-50 text-amber-700",
  KNOWN_ERROR: "bg-violet-50 text-violet-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
};
const fieldCls = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function ProblemsPanel({ incidents }: { incidents: RawIncident[] }) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Problem>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/problems").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/problems?candidates=1").then((r) => (r.ok ? r.json() : [])),
    ]).then(([p, c]) => { setProblems(Array.isArray(p) ? p : []); setCandidates(Array.isArray(c) ? c : []); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const insights = computeIncidentInsights(
    incidents.map<InsightIncident>((i) => ({
      id: i.id, severity: i.severity, status: i.status, reportedAt: new Date(i.reportedAt),
      acknowledgedAt: d(i.acknowledgedAt), resolvedAt: d(i.resolvedAt), assigneeUserId: i.assigneeUserId,
      reporterEmail: i.reporterEmail ?? null, slaWarnedAt: d(i.slaWarnedAt), slaBreachedAt: d(i.slaBreachedAt),
      lastReporterUpdateAt: d(i.lastReporterUpdateAt), problemId: i.problemId ?? null,
    })),
  );

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key); setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))).error as string | undefined;
        setError(e === "known_error_needs_workaround" ? "Add a workaround or runbook before marking this a known error." : e ?? "Request failed");
        return false;
      }
      load();
      return true;
    } finally { setBusy(null); }
  }

  const createFrom = (c: Candidate) =>
    call("/api/problems", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidentIds: c.incidentIds }) }, c.key);
  const save = (id: string) =>
    call(`/api/problems/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }, id);
  const makeFixTask = (id: string) => call(`/api/problems/${id}`, { method: "POST" }, `fix-${id}`);

  const trendText = insights.mttrTrend ? ` (${insights.mttrTrend})` : "";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ["Open", insights.open, "text-slate-900"],
          ["SLA at risk", insights.atRisk, insights.atRisk ? "text-amber-600" : "text-slate-900"],
          ["SLA breached", insights.breached, insights.breached ? "text-rose-600" : "text-slate-900"],
          ["Unassigned", insights.unassigned, insights.unassigned ? "text-amber-600" : "text-slate-900"],
          ["Reporters waiting", insights.reportersWaiting, insights.reportersWaiting ? "text-amber-600" : "text-slate-900"],
        ].map(([label, value, cls]) => (
          <div key={label as string} className="bg-white border border-slate-100 rounded-xl p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-xl font-semibold ${cls}`}>{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        MTTR last 30 days: {insights.mttrLast30 != null ? formatMinutes(insights.mttrLast30) : "—"}{trendText}
        {insights.mttrPrev30 != null && ` · previous 30 days: ${formatMinutes(insights.mttrPrev30)}`}
      </p>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {candidates.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">Recurring issues detected</p>
          <div className="space-y-2">
            {candidates.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-700">{c.incidentIds.length} similar incidents: {c.titles.slice(0, 3).join(" · ")}</span>
                <button onClick={() => createFrom(c)} disabled={busy === c.key} className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
                  {busy === c.key ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />} Create problem
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-xl">
        <p className="px-4 py-3 text-sm font-semibold text-slate-800 border-b border-slate-100">Problems</p>
        {problems.length === 0 && <p className="px-4 py-6 text-sm text-slate-400 text-center">No problems yet. Raise one from an incident or a detected pattern.</p>}
        {problems.map((p) => (
          <div key={p.id} className="border-b border-slate-50 last:border-0">
            <button
              onClick={() => { setOpenId(openId === p.id ? null : p.id); setDraft(p); setError(null); }}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50/60"
            >
              <span className="text-sm font-medium text-slate-800">{p.title}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLS[p.status] ?? ""}`}>{p.status.replace("_", " ")}</span>
            </button>
            {openId === p.id && (
              <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {([
                  ["rootCause", "Root cause"], ["workaround", "Workaround (shown on matching incidents, emailed to reporters)"],
                  ["runbook", "Runbook / resolution steps"], ["permanentFix", "Permanent fix"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="block">
                    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
                    <textarea rows={3} className={fieldCls} value={(draft[k] as string | null) ?? ""} onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.value }))} />
                  </label>
                ))}
                <label className="block">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Status</span>
                  <select className={fieldCls} value={draft.status ?? p.status} onChange={(e) => setDraft((x) => ({ ...x, status: e.target.value }))}>
                    <option value="INVESTIGATING">Investigating</option>
                    <option value="KNOWN_ERROR">Known error (workaround available)</option>
                    <option value="RESOLVED">Resolved (permanent fix done)</option>
                  </select>
                </label>
                <div className="flex items-end gap-2">
                  <button onClick={() => save(p.id)} disabled={busy === p.id} className="text-xs px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50 font-medium">
                    {busy === p.id ? "Saving…" : "Save"}
                  </button>
                  {p.projectId && !p.fixTaskId && (
                    <button onClick={() => makeFixTask(p.id)} disabled={busy === `fix-${p.id}`} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                      <ClipboardList size={13} /> Create fix task
                    </button>
                  )}
                  {p.fixTaskId && <span className="text-xs text-emerald-700">Fix task created</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
