"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { RagBadge } from "@/components/badges";
import { formatDateTime } from "@/lib/format";
import { Plus } from "lucide-react";

export default function StatusTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ragStatus: detail.project.ragStatus,
    percentComplete: detail.project.percentComplete,
    summary: "",
    accomplishments: "",
    upcoming: "",
    blockers: "",
  });

  async function submit() {
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/status-updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-accent-50 border border-accent-100 rounded-xl p-4 text-sm text-accent-800">
        <span className="font-semibold">Auto-computed health:</span> {detail.autoRag} — {detail.autoRagReasons.join("; ")}
        {" "}(schedule variance {detail.scheduleVarianceDays} days, budget variance {detail.budgetVariancePercent}%)
      </div>

      <Card
        title="Status Update History"
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
          >
            <Plus size={14} /> Log Status Update
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="RAG status">
                <select value={form.ragStatus} onChange={(e) => setForm((f) => ({ ...f, ragStatus: e.target.value as typeof f.ragStatus }))} className={inputCls}>
                  {["GREEN", "YELLOW", "RED"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="% Complete">
                <input type="number" min={0} max={100} value={form.percentComplete} onChange={(e) => setForm((f) => ({ ...f, percentComplete: Number(e.target.value) }))} className={inputCls} />
              </Field>
            </div>
            <Field label="Summary">
              <textarea value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Accomplishments">
              <textarea value={form.accomplishments} onChange={(e) => setForm((f) => ({ ...f, accomplishments: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Upcoming">
              <textarea value={form.upcoming} onChange={(e) => setForm((f) => ({ ...f, upcoming: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Blockers">
              <textarea value={form.blockers} onChange={(e) => setForm((f) => ({ ...f, blockers: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save Update"}</PrimaryButton>
          </div>
        )}

        <div className="space-y-3">
          {detail.statusUpdates.map((u) => (
            <div key={u.id} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <RagBadge rag={u.ragStatus} />
                  <span className="text-xs text-slate-400">{formatDateTime(u.date)}</span>
                </div>
                <span className="text-xs text-slate-500">{u.percentComplete}% complete</span>
              </div>
              {u.summary && <p className="text-sm text-slate-700">{u.summary}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2 text-xs">
                {u.accomplishments && <div><span className="font-medium text-slate-500">Done:</span> {u.accomplishments}</div>}
                {u.upcoming && <div><span className="font-medium text-slate-500">Next:</span> {u.upcoming}</div>}
                {u.blockers && <div><span className="font-medium text-slate-500">Blockers:</span> {u.blockers}</div>}
              </div>
            </div>
          ))}
          {detail.statusUpdates.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No status updates logged yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
