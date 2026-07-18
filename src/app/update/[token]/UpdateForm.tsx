"use client";
import { useState } from "react";

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function UpdateForm({
  token,
  task,
}: {
  token: string;
  task: { status: string } | null;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    responseText: "",
    ragStatus: "GREEN",
    percentComplete: 50,
    blockers: "",
    taskStatus: task?.status ?? "IN_PROGRESS",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/update/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) setSubmitted(true);
  }

  if (submitted) {
    return <p className="text-sm text-emerald-600">Thanks — your update has been sent to the project.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {task && (
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Task status</label>
          <select value={form.taskStatus} onChange={(e) => setForm((f) => ({ ...f, taskStatus: e.target.value }))} className={inputCls}>
            {["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Overall health</label>
        <select value={form.ragStatus} onChange={(e) => setForm((f) => ({ ...f, ragStatus: e.target.value }))} className={inputCls}>
          <option value="GREEN">On track</option>
          <option value="YELLOW">At risk</option>
          <option value="RED">Off track</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">% complete</label>
        <input type="number" min={0} max={100} value={form.percentComplete} onChange={(e) => setForm((f) => ({ ...f, percentComplete: Number(e.target.value) }))} className={inputCls} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">What&apos;s the update?</label>
        <textarea required value={form.responseText} onChange={(e) => setForm((f) => ({ ...f, responseText: e.target.value }))} className={inputCls} rows={3} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Any blockers?</label>
        <textarea value={form.blockers} onChange={(e) => setForm((f) => ({ ...f, blockers: e.target.value }))} className={inputCls} rows={2} />
      </div>
      <button type="submit" disabled={saving} className="w-full px-4 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50">
        {saving ? "Sending..." : "Send update"}
      </button>
    </form>
  );
}
