"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateInput } from "@/lib/format";
import { Sparkles, Loader2, Download } from "lucide-react";

export default function CharterTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const p = detail.project;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    businessCase: p.businessCase ?? "",
    objectives: p.objectives ?? "",
    scopeInScope: p.scopeInScope ?? "",
    scopeOutOfScope: p.scopeOutOfScope ?? "",
    deliverables: p.deliverables ?? "",
    successCriteria: p.successCriteria ?? "",
    stakeholders: p.stakeholders ?? "",
    assumptionsRisks: p.assumptionsRisks ?? "",
    charterApprovedBy: p.charterApprovedBy ?? "",
    charterApprovedAt: formatDateInput(p.charterApprovedAt),
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(data?.error ?? "Could not save the charter. Please try again.");
      return;
    }
    router.refresh();
  }

  async function generateDraft() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-charter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (data.draft) {
        // Best-effort parse of the AI markdown into fields by section heading.
        const sections = parseMarkdownSections(data.draft);
        setForm((f) => ({
          ...f,
          businessCase: sections["Business Case"] ?? f.businessCase,
          objectives: sections["Objectives"] ?? f.objectives,
          scopeInScope: sections["Scope"] ? sections["Scope"] : f.scopeInScope,
          deliverables: sections["Deliverables"] ?? f.deliverables,
          successCriteria: sections["Success Criteria"] ?? f.successCriteria,
          stakeholders: sections["Stakeholders"] ?? f.stakeholders,
          assumptionsRisks: sections["Assumptions & Risks"] ?? f.assumptionsRisks,
        }));
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card
        title="Project Charter"
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/api/projects/${p.id}/charter-pdf`}
              download
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <Download size={14} /> Download PDF
            </a>
            <button
              onClick={generateDraft}
              disabled={generating}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Draft with AI
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Business case">
            <textarea value={form.businessCase} onChange={(e) => update("businessCase", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Objectives">
            <textarea value={form.objectives} onChange={(e) => update("objectives", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="In scope">
              <textarea value={form.scopeInScope} onChange={(e) => update("scopeInScope", e.target.value)} className={inputCls} rows={2} />
            </Field>
            <Field label="Out of scope">
              <textarea value={form.scopeOutOfScope} onChange={(e) => update("scopeOutOfScope", e.target.value)} className={inputCls} rows={2} />
            </Field>
          </div>
          <Field label="Deliverables">
            <textarea value={form.deliverables} onChange={(e) => update("deliverables", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Success criteria">
            <textarea value={form.successCriteria} onChange={(e) => update("successCriteria", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Stakeholders">
            <textarea value={form.stakeholders} onChange={(e) => update("stakeholders", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Assumptions & risks">
            <textarea value={form.assumptionsRisks} onChange={(e) => update("assumptionsRisks", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Approved by">
              <input value={form.charterApprovedBy} onChange={(e) => update("charterApprovedBy", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Approved on">
              <input type="date" value={form.charterApprovedAt} onChange={(e) => update("charterApprovedAt", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Charter"}
        </PrimaryButton>
        {saveError && <p className="text-xs text-rose-600">{saveError}</p>}
      </div>
    </div>
  );
}

function parseMarkdownSections(md: string): Record<string, string> {
  const lines = md.split("\n");
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) sections[current] = buffer.join("\n").trim();
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s*(.+)$/);
    if (headingMatch) {
      flush();
      current = headingMatch[1].replace(/\*\*/g, "").trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}
