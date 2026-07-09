"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateTime } from "@/lib/format";
import { Plus, Mail, Users, Phone, Presentation, MessageSquare } from "lucide-react";

const TYPE_ICON: Record<string, React.ElementType> = {
  MEETING: Users,
  EMAIL: Mail,
  SLACK: MessageSquare,
  CALL: Phone,
  WORKSHOP: Presentation,
  OTHER: MessageSquare,
};

export default function CommsTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: "MEETING", summary: "", participants: "", actionItems: "" });

  async function submit() {
    if (!form.summary.trim()) return;
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/communications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ type: "MEETING", summary: "", participants: "", actionItems: "" });
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card
        title={`Communication Log (${detail.communications.length})`}
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >
            <Plus size={14} /> Log Communication
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={inputCls}>
                {["MEETING", "EMAIL", "SLACK", "CALL", "WORKSHOP", "OTHER"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Summary">
              <textarea value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Participants">
              <input value={form.participants} onChange={(e) => setForm((f) => ({ ...f, participants: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Action items">
              <textarea value={form.actionItems} onChange={(e) => setForm((f) => ({ ...f, actionItems: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save"}</PrimaryButton>
          </div>
        )}

        <div className="space-y-3">
          {detail.communications.map((c) => {
            const Icon = TYPE_ICON[c.type] ?? MessageSquare;
            return (
              <div key={c.id} className="border border-slate-100 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className="text-indigo-500" />
                  <span className="text-xs font-medium text-slate-600">{c.type}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(c.date)}</span>
                </div>
                {c.summary && <p className="text-sm text-slate-700">{c.summary}</p>}
                {c.participants && <p className="text-xs text-slate-500 mt-1">Participants: {c.participants}</p>}
                {c.actionItems && <p className="text-xs text-slate-500 mt-1">Action items: {c.actionItems}</p>}
              </div>
            );
          })}
          {detail.communications.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No communications logged yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
