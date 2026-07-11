"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { PriorityBadge } from "@/components/badges";
import { Plus } from "lucide-react";

export default function RisksTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ description: "", impact: "MEDIUM", likelihood: "MEDIUM", mitigation: "", owner: "" });

  async function submit() {
    if (!form.description.trim()) return;
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/risks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ description: "", impact: "MEDIUM", likelihood: "MEDIUM", mitigation: "", owner: "" });
    router.refresh();
  }

  async function updateStatus(riskId: string, status: string) {
    await fetch(`/api/projects/${detail.project.id}/risks/${riskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card
        title={`Risks (${detail.risks.length})`}
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >
            <Plus size={14} /> Add Risk
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <Field label="Description">
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Impact">
                <select value={form.impact} onChange={(e) => setForm((f) => ({ ...f, impact: e.target.value }))} className={inputCls}>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Likelihood">
                <select value={form.likelihood} onChange={(e) => setForm((f) => ({ ...f, likelihood: e.target.value }))} className={inputCls}>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Owner">
                <input value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <Field label="Mitigation">
              <textarea value={form.mitigation} onChange={(e) => setForm((f) => ({ ...f, mitigation: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save Risk"}</PrimaryButton>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 font-medium">Risk</th>
              <th className="py-2 font-medium">Impact</th>
              <th className="py-2 font-medium">Likelihood</th>
              <th className="py-2 font-medium">Owner</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {detail.risks.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2.5 pr-2">
                  <p className="font-medium text-slate-800">{r.description}</p>
                  {r.mitigation && <p className="text-xs text-slate-500 mt-0.5">Mitigation: {r.mitigation}</p>}
                </td>
                <td className="py-2.5"><PriorityBadge priority={r.impact} /></td>
                <td className="py-2.5"><PriorityBadge priority={r.likelihood} /></td>
                <td className="py-2.5 text-slate-600">{r.owner ?? "—"}</td>
                <td className="py-2.5">
                  <select
                    value={r.status}
                    onChange={(e) => updateStatus(r.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                  >
                    {["OPEN", "MITIGATING", "CLOSED", "ACCEPTED"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {detail.risks.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">No risks logged yet.</td></tr>
            )}
          </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
