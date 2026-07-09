"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateInput } from "@/lib/format";

export default function OverviewTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const p = detail.project;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: p.name,
    description: p.description ?? "",
    sponsor: p.sponsor ?? "",
    projectManager: p.projectManager ?? "",
    stage: p.stage,
    priority: p.priority,
    startDate: formatDateInput(p.startDate),
    targetEndDate: formatDateInput(p.targetEndDate),
    budgetPlanned: p.budgetPlanned ?? 0,
    budgetActual: p.budgetActual ?? 0,
    percentComplete: p.percentComplete,
    country: p.country ?? "",
    program: p.program ?? "",
    problemStatement: p.problemStatement ?? "",
    proposedSolution: p.proposedSolution ?? "",
    expectedBenefits: p.expectedBenefits ?? "",
    ideationNotes: p.ideationNotes ?? "",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card title="Inception">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Project Name">
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Stage">
            <select value={form.stage} onChange={(e) => update("stage", e.target.value as typeof form.stage)} className={inputCls}>
              {["INCEPTION", "IDEATION", "CHARTER", "EXECUTION", "CLOSING", "CLOSED"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Sponsor">
            <input value={form.sponsor} onChange={(e) => update("sponsor", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Project Manager">
            <input value={form.projectManager} onChange={(e) => update("projectManager", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => update("priority", e.target.value as typeof form.priority)} className={inputCls}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="% Complete">
            <input type="number" min={0} max={100} value={form.percentComplete} onChange={(e) => update("percentComplete", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Country">
            <input value={form.country} onChange={(e) => update("country", e.target.value)} className={inputCls} placeholder="e.g. United States" />
          </Field>
          <Field label="Program">
            <input value={form.program} onChange={(e) => update("program", e.target.value)} className={inputCls} placeholder="e.g. Digital Transformation" />
          </Field>
          <Field label="Start Date">
            <input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Target End Date">
            <input type="date" value={form.targetEndDate} onChange={(e) => update("targetEndDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Budget Planned ($)">
            <input type="number" value={form.budgetPlanned} onChange={(e) => update("budgetPlanned", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Budget Actual ($)">
            <input type="number" value={form.budgetActual} onChange={(e) => update("budgetActual", Number(e.target.value))} className={inputCls} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Description">
            <textarea value={form.description} onChange={(e) => update("description", e.target.value)} className={inputCls} rows={2} />
          </Field>
        </div>
      </Card>

      <Card title="Ideation">
        <div className="space-y-4">
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
            <textarea value={form.ideationNotes} onChange={(e) => update("ideationNotes", e.target.value)} className={inputCls} rows={3} />
          </Field>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </PrimaryButton>
        <AutoHealthNote detail={detail} />
      </div>
    </div>
  );
}

function AutoHealthNote({ detail }: { detail: ProjectDetail }) {
  return (
    <p className="text-xs text-slate-400">
      Auto health: <span className="font-medium">{detail.autoRag}</span> — {detail.autoRagReasons.join("; ")}
    </p>
  );
}
