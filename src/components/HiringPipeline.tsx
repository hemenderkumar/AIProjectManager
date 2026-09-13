"use client";
import { useEffect, useState } from "react";
import { Users, Plus, Trash2 } from "lucide-react";
import { SOURCING_TYPES, SOURCING_LABELS, type SourcingType } from "@/lib/deliveryModel";
import { formatDate } from "@/lib/format";

type Requisition = {
  id: string;
  skill: string;
  role: string | null;
  targetHeadcount: number;
  sourcingType: SourcingType | null;
  status: "OPEN" | "INTERVIEWING" | "OFFER_EXTENDED" | "FILLED" | "CANCELLED";
  targetStartDate: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  filledByResourceId: string | null;
  filledByResourceName: string | null;
  filledAt: string | null;
};

const STATUSES: Requisition["status"][] = ["OPEN", "INTERVIEWING", "OFFER_EXTENDED", "FILLED", "CANCELLED"];

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700",
  INTERVIEWING: "bg-blue-50 text-blue-700",
  OFFER_EXTENDED: "bg-violet-50 text-violet-700",
  FILLED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

const emptyForm = { skill: "", role: "", targetHeadcount: 1, sourcingType: "" as SourcingType | "", targetStartDate: "", notes: "" };

// Sits below the Skill Capacity Forecast on the Resources page -- that forecast is reactive
// (reports a gap that already exists); this is the forward-looking half: is anything actually
// being done about it. Not tied to a project -- capacity is a shared roster resource, same
// reasoning as the proportional-attribution comments in lib/forecast.ts. Self-fetching, same
// pattern as every other Resources-page section (RateCardSection, SkillRoleMapSection, etc.).
export default function HiringPipeline() {
  const [reqs, setReqs] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/hiring-requisitions");
    const data = await res.json();
    setReqs(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function create() {
    if (!form.skill.trim()) return;
    setSaving(true);
    await fetch("/api/hiring-requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skill: form.skill,
        role: form.role || undefined,
        targetHeadcount: form.targetHeadcount,
        sourcingType: form.sourcingType || undefined,
        targetStartDate: form.targetStartDate || undefined,
        notes: form.notes || undefined,
      }),
    });
    setSaving(false);
    setShowForm(false);
    setForm(emptyForm);
    load();
  }

  async function updateStatus(id: string, status: Requisition["status"]) {
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    await fetch(`/api/hiring-requisitions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/hiring-requisitions/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return null;

  const openCount = reqs.filter((r) => r.status !== "FILLED" && r.status !== "CANCELLED").length;
  const filledCount = reqs.filter((r) => r.status === "FILLED").length;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Users size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Hiring Pipeline</p>
        <span className="text-xs text-slate-400">
          — {openCount} in progress, {filledCount} filled · the forward-looking half of the Skill Capacity Forecast above
        </span>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
        >
          <Plus size={14} /> Open Requisition
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-slate-50 rounded-lg space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Skill</label>
              <input value={form.skill} onChange={(e) => setForm((f) => ({ ...f, skill: e.target.value }))} className={inputCls} placeholder="e.g. React" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Role (optional)</label>
              <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls} placeholder="e.g. Frontend Engineer" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Headcount</label>
              <input
                type="number"
                min={1}
                value={form.targetHeadcount}
                onChange={(e) => setForm((f) => ({ ...f, targetHeadcount: Math.max(1, Number(e.target.value)) }))}
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Sourcing</label>
              <select value={form.sourcingType} onChange={(e) => setForm((f) => ({ ...f, sourcingType: e.target.value as SourcingType }))} className={inputCls}>
                <option value="">Unspecified</option>
                {SOURCING_TYPES.map((s) => <option key={s} value={s}>{SOURCING_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Target start</label>
              <input type="date" value={form.targetStartDate} onChange={(e) => setForm((f) => ({ ...f, targetStartDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <button
            onClick={create}
            disabled={saving}
            className="px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? "Opening..." : "Open Requisition"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 font-medium">Skill / Role</th>
              <th className="py-2 font-medium">Headcount</th>
              <th className="py-2 font-medium">Sourcing</th>
              <th className="py-2 font-medium">Target start</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {reqs.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5">
                  <p className="font-medium text-slate-800 capitalize">{r.skill}</p>
                  {r.role && <p className="text-xs text-slate-400">{r.role}</p>}
                  {r.status === "FILLED" && r.filledByResourceName && (
                    <p className="text-xs text-emerald-600">Filled by {r.filledByResourceName} on {formatDate(r.filledAt)}</p>
                  )}
                </td>
                <td className="py-2.5 text-slate-600">{r.targetHeadcount}</td>
                <td className="py-2.5 text-slate-600">{r.sourcingType ? SOURCING_LABELS[r.sourcingType] : "—"}</td>
                <td className="py-2.5 text-slate-600">{formatDate(r.targetStartDate)}</td>
                <td className="py-2.5">
                  <select
                    value={r.status}
                    onChange={(e) => updateStatus(r.id, e.target.value as Requisition["status"])}
                    className={`text-xs border border-slate-200 rounded-md px-1.5 py-1 ${STATUS_STYLES[r.status]}`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </td>
                <td className="py-2.5 text-right">
                  <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {reqs.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">No requisitions open. Start one from a gap in the forecast above, or here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
