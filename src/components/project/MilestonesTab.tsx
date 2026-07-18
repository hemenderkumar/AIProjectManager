"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDate } from "@/lib/format";
import { Plus } from "lucide-react";

export default function MilestonesTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", dueDate: "" });

  async function submit() {
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ name: "", dueDate: "" });
    router.refresh();
  }

  async function updateStatus(milestoneId: string, status: string) {
    await fetch(`/api/projects/${detail.project.id}/milestones/${milestoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card
        title={`Milestones (${detail.milestones.length})`}
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
          >
            <Plus size={14} /> Add Milestone
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Due date">
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
            </Field>
            <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving..." : "Add"}</PrimaryButton>
          </div>
        )}

        <div className="space-y-2">
          {detail.milestones.map((m) => (
            <div key={m.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-800">{m.name}</p>
                <p className="text-xs text-slate-400">Due {formatDate(m.dueDate)}</p>
              </div>
              <select
                value={m.status}
                onChange={(e) => updateStatus(m.id, e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
              >
                {["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
          ))}
          {detail.milestones.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No milestones yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
