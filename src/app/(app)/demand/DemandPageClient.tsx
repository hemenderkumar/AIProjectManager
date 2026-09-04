"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import KpiCard from "@/components/KpiCard";
import CategoryBar from "@/components/CategoryBar";
import { Inbox, Copy, Check, ChevronDown, ChevronUp, Rocket, Search } from "lucide-react";

type Demand = {
  id: string;
  title: string;
  description: string;
  expectedOutcome: string | null;
  requestedByName: string;
  requestedByEmail: string;
  status: string;
  type: string | null;
  triageNotes: string | null;
  businessValueScore: number | null;
  urgencyScore: number | null;
  effortTshirtSize: string | null;
  priorityScore: number | null;
  decisionReason: string | null;
  capacityNotes: string | null;
  convertedProjectId: string | null;
  createdAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED: "bg-slate-100 text-slate-600",
  TRIAGED: "bg-sky-50 text-sky-700",
  SCORED: "bg-indigo-50 text-indigo-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  DEFERRED: "bg-amber-50 text-amber-700",
  REJECTED: "bg-rose-50 text-rose-700",
  CONVERTED: "bg-accent-50 text-accent-700",
};

const inputCls = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

// Backlog-progression order (matches demandStatusEnum in schema.ts), not alphabetical -- both
// the filter dropdown and the status chart should read left-to-right as "further along."
const STATUS_ORDER = ["SUBMITTED", "TRIAGED", "SCORED", "APPROVED", "DEFERRED", "REJECTED", "CONVERTED"];
const TYPE_OPTIONS = ["STRATEGIC", "RUN_THE_BUSINESS", "COMPLIANCE", "ENHANCEMENT"];
// Statuses that still need action -- everything else (REJECTED/CONVERTED, and DEFERRED is
// arguably revisitable but treated as resolved-for-now) is out of the active backlog.
const OPEN_STATUSES = new Set(["SUBMITTED", "TRIAGED", "SCORED"]);

export default function DemandPageClient() {
  const router = useRouter();
  const [items, setItems] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  function load() {
    fetch("/api/demand").then((r) => (r.ok ? r.json() : [])).then((rows) => setItems(Array.isArray(rows) ? rows : [])).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function act(id: string, body: Record<string, unknown>) {
    await fetch(`/api/demand/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }

  async function convert(id: string) {
    const res = await fetch(`/api/demand/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "convert" }) });
    if (res.ok) {
      const project = await res.json();
      router.push(`/projects/${project.id}`);
    }
  }

  // KPI/chart summary is computed off the FULL backlog, independent of the filters below --
  // same relationship as /dashboard's KPI tiles vs. the "Needs Attention" table underneath
  // them, so narrowing the list with a filter doesn't also shrink the health snapshot.
  const summary = useMemo(() => {
    const byStatus: Record<string, number> = {};
    items.forEach((d) => (byStatus[d.status] = (byStatus[d.status] ?? 0) + 1));
    const openInBacklog = items.filter((d) => OPEN_STATUSES.has(d.status)).length;
    const readyToConvert = byStatus.APPROVED ?? 0;
    const converted = byStatus.CONVERTED ?? 0;
    const conversionRate = items.length === 0 ? 0 : Math.round((converted / items.length) * 100);
    return { byStatus, openInBacklog, readyToConvert, converted, conversionRate, total: items.length };
  }, [items]);

  const statusChartData = STATUS_ORDER.map((s) => ({ label: s.replace(/_/g, " "), count: summary.byStatus[s] ?? 0 }));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((d) => {
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && d.type !== typeFilter) return false;
      if (q && !`${d.title} ${d.requestedByName} ${d.requestedByEmail}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, statusFilter, typeFilter, search]);

  const sorted = [...filtered].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/demand-request` : "/demand-request";

  return (
    <div>
      <Topbar
        title="Demand"
        subtitle="The front door — raw requests land here first, get triaged and scored, then only what's approved becomes a real Idea"
      />
      <div className="p-8 max-w-4xl space-y-4">
        {!loading && items.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard label="Open in Backlog" value={summary.openInBacklog} />
              <KpiCard label="Awaiting Triage" value={summary.byStatus.SUBMITTED ?? 0} tone={(summary.byStatus.SUBMITTED ?? 0) > 0 ? "warn" : "default"} />
              <KpiCard label="Ready to Convert" value={summary.readyToConvert} tone={summary.readyToConvert > 0 ? "good" : "default"} />
              <KpiCard label="Converted to Projects" value={summary.converted} />
              <KpiCard label="Conversion Rate" value={`${summary.conversionRate}%`} hint={`of ${summary.total} total`} />
            </div>
            <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
              <p className="text-sm font-semibold text-slate-900 mb-1">Backlog by Status</p>
              <CategoryBar data={statusChartData} />
            </div>
          </>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Share this link so anyone can submit a request without an Executa account:</p>
          <button
            onClick={() => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        {!loading && items.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title or requester..."
                className="w-full text-xs border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5">
              <option value="ALL">All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5">
              <option value="ALL">All types</option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
            {(statusFilter !== "ALL" || typeFilter !== "ALL" || search) && (
              <button
                onClick={() => { setStatusFilter("ALL"); setTypeFilter("ALL"); setSearch(""); }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-10 text-center">
            <Inbox size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">Nothing in the backlog yet.</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-10 text-center">
            <p className="text-sm text-slate-500">No requests match these filters.</p>
          </div>
        ) : (
          sorted.map((d) => {
            const open = expanded === d.id;
            return (
              <div key={d.id} className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
                <button onClick={() => setExpanded(open ? null : d.id)} className="w-full flex items-start justify-between gap-3 text-left">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{d.title}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                        {d.status.replace(/_/g, " ")}
                      </span>
                      {d.priorityScore != null && <span className="text-xs text-slate-400">score {d.priorityScore.toFixed(1)}</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{d.requestedByName} · {d.requestedByEmail}</p>
                  </div>
                  {open ? <ChevronUp size={16} className="text-slate-400 shrink-0" /> : <ChevronDown size={16} className="text-slate-400 shrink-0" />}
                </button>

                {open && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <p className="text-sm text-slate-600">{d.description}</p>
                    {d.expectedOutcome && (
                      <p className="text-sm text-slate-500">
                        <span className="font-medium text-slate-600">Expected outcome:</span> {d.expectedOutcome}
                      </p>
                    )}

                    {d.status === "SUBMITTED" && <TriageForm onSubmit={(notes) => act(d.id, { action: "triage", notes })} />}
                    {d.status === "TRIAGED" && <ScoreForm onSubmit={(v) => act(d.id, { action: "score", ...v })} />}
                    {d.status === "SCORED" && <DecideForm onSubmit={(v) => act(d.id, { action: "decide", ...v })} />}
                    {d.status === "APPROVED" && (
                      <button onClick={() => convert(d.id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700">
                        <Rocket size={13} /> Convert to project
                      </button>
                    )}
                    {d.status === "CONVERTED" && d.convertedProjectId && (
                      <a href={`/projects/${d.convertedProjectId}`} className="text-xs font-medium text-accent-600 hover:underline">View converted project →</a>
                    )}

                    {d.triageNotes && <p className="text-xs text-slate-400">Triage: {d.triageNotes}</p>}
                    {d.decisionReason && <p className="text-xs text-slate-400">Decision: {d.decisionReason}</p>}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TriageForm({ onSubmit }: { onSubmit: (notes: string) => void }) {
  const [notes, setNotes] = useState("");
  return (
    <div className="flex items-center gap-2">
      <input className={inputCls} placeholder="Triage notes — viable? duplicate?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button onClick={() => onSubmit(notes)} className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700">Mark triaged</button>
    </div>
  );
}

function ScoreForm({ onSubmit }: { onSubmit: (v: { businessValueScore: number; urgencyScore: number; effortTshirtSize: string }) => void }) {
  const [businessValueScore, setBv] = useState(3);
  const [urgencyScore, setUrg] = useState(3);
  const [effort, setEffort] = useState("M");
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <label className="text-xs text-slate-500">Value <select value={businessValueScore} onChange={(e) => setBv(Number(e.target.value))} className="border border-slate-200 rounded px-1 py-1 ml-1">{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="text-xs text-slate-500">Urgency <select value={urgencyScore} onChange={(e) => setUrg(Number(e.target.value))} className="border border-slate-200 rounded px-1 py-1 ml-1">{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <label className="text-xs text-slate-500">Effort <select value={effort} onChange={(e) => setEffort(e.target.value)} className="border border-slate-200 rounded px-1 py-1 ml-1">{["S","M","L","XL"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <button onClick={() => onSubmit({ businessValueScore, urgencyScore, effortTshirtSize: effort })} className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Save score</button>
    </div>
  );
}

function DecideForm({ onSubmit }: { onSubmit: (v: { decision: string; reason: string; capacityNotes?: string }) => void }) {
  const [reason, setReason] = useState("");
  const [capacityNotes, setCapacityNotes] = useState("");
  return (
    <div className="space-y-2">
      <input className={inputCls} placeholder="Capacity notes (optional)" value={capacityNotes} onChange={(e) => setCapacityNotes(e.target.value)} />
      <div className="flex items-center gap-2">
        <input className={inputCls} placeholder="Decision reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button onClick={() => onSubmit({ decision: "APPROVED", reason, capacityNotes })} className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">Approve</button>
        <button onClick={() => onSubmit({ decision: "DEFERRED", reason, capacityNotes })} className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700">Defer</button>
        <button onClick={() => onSubmit({ decision: "REJECTED", reason, capacityNotes })} className="shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700">Reject</button>
      </div>
    </div>
  );
}
