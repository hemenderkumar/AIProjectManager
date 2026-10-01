"use client";
import { useEffect, useState } from "react";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { PriorityBadge } from "@/components/badges";
import { Plus } from "lucide-react";

type Escalation = {
  id: string;
  title: string;
  description: string | null;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  owner: string | null;
  raisedBy: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
};

const STATUS_CLS: Record<Escalation["status"], string> = {
  OPEN: "text-rose-600",
  IN_PROGRESS: "text-amber-600",
  RESOLVED: "text-emerald-600",
};

// "This needs committee-level help right now" -- narrower and more urgent than a general
// risk. Open rows here feed straight into the steering committee report's Escalations
// section instead of the AI purely inferring it from portfolio data. See escalations in
// schema.ts.
export default function EscalationsPanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", severity: "HIGH", owner: "" });

  function load() {
    fetch(`/api/projects/${projectId}/escalations`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function submit() {
    if (!form.title.trim()) return;
    setSaving(true);
    await fetch(`/api/projects/${projectId}/escalations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ title: "", description: "", severity: "HIGH", owner: "" });
    load();
  }

  async function updateStatus(escId: string, status: string) {
    await fetch(`/api/projects/${projectId}/escalations/${escId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  const openCount = items.filter((e) => e.status !== "RESOLVED").length;

  return (
    <Card
      title={`Escalations (${openCount} open)`}
      action={
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
        >
          <Plus size={14} /> Raise Escalation
        </button>
      }
    >
      {showForm && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
          <Field label="What needs committee-level help?">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Details">
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} rows={2} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Severity">
              <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))} className={inputCls}>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Owner">
              <input value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving..." : "Raise Escalation"}</PrimaryButton>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 font-medium">Escalation</th>
              <th className="py-2 font-medium">Severity</th>
              <th className="py-2 font-medium">Owner</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2.5 pr-2 max-w-xs">
                  <p className="font-medium text-slate-800">{e.title}</p>
                  {e.description && <p className="text-xs text-slate-500 mt-0.5">{e.description}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">Raised by {e.raisedBy}</p>
                </td>
                <td className="py-2.5"><PriorityBadge priority={e.severity} /></td>
                <td className="py-2.5 text-slate-600">{e.owner ?? "—"}</td>
                <td className="py-2.5">
                  <select
                    value={e.status}
                    onChange={(ev) => updateStatus(e.id, ev.target.value)}
                    className={`text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white font-medium ${STATUS_CLS[e.status]}`}
                  >
                    {["OPEN", "IN_PROGRESS", "RESOLVED"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-slate-400">No escalations — nothing needs committee-level help right now.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
