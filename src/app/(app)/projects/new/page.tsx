"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";

export default function NewProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    sponsor: "",
    projectManager: "",
    priority: "MEDIUM",
    stage: "INCEPTION",
    country: "",
    program: "",
    problemStatement: "",
    proposedSolution: "",
    expectedBenefits: "",
    ideationNotes: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const created = await res.json();
    setSaving(false);
    if (created?.id) router.push(`/projects/${created.id}`);
  }

  return (
    <div>
      <Topbar title="New Project" subtitle="Kick off inception & ideation for a new project" />
      <form onSubmit={submit} className="p-8 max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900">Inception</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Project Name *">
              <input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Stage">
              <select value={form.stage} onChange={(e) => update("stage", e.target.value)} className={inputCls}>
                <option value="INCEPTION">Inception</option>
                <option value="IDEATION">Ideation</option>
                <option value="CHARTER">Charter</option>
                <option value="EXECUTION">Execution</option>
              </select>
            </Field>
            <Field label="Sponsor">
              <input value={form.sponsor} onChange={(e) => update("sponsor", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Project Manager">
              <input value={form.projectManager} onChange={(e) => update("projectManager", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={(e) => update("priority", e.target.value)} className={inputCls}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </Field>
            <Field label="Country">
              <input value={form.country} onChange={(e) => update("country", e.target.value)} className={inputCls} placeholder="e.g. United States" />
            </Field>
            <Field label="Program">
              <input value={form.program} onChange={(e) => update("program", e.target.value)} className={inputCls} placeholder="e.g. Digital Transformation" />
            </Field>
          </div>
          <Field label="Description">
            <textarea value={form.description} onChange={(e) => update("description", e.target.value)} className={inputCls} rows={2} />
          </Field>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900">Ideation</p>
          <Field label="Problem statement">
            <textarea value={form.problemStatement} onChange={(e) => update("problemStatement", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Proposed solution">
            <textarea value={form.proposedSolution} onChange={(e) => update("proposedSolution", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Expected benefits">
            <textarea value={form.expectedBenefits} onChange={(e) => update("expectedBenefits", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Ideation notes">
            <textarea value={form.ideationNotes} onChange={(e) => update("ideationNotes", e.target.value)} className={inputCls} rows={2} />
          </Field>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
