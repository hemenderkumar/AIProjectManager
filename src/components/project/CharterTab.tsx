"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateInput } from "@/lib/format";
import { Sparkles, Loader2 } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";
import MermaidDiagram from "@/components/MermaidDiagram";
import DownloadPdfLink from "@/components/DownloadPdfLink";

export default function CharterTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const p = detail.project;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [regeneratingDiagram, setRegeneratingDiagram] = useState(false);
  const [form, setForm] = useState({
    businessCase: p.businessCase ?? "",
    objectives: p.objectives ?? "",
    scopeInScope: p.scopeInScope ?? "",
    scopeOutOfScope: p.scopeOutOfScope ?? "",
    highLevelRequirements: p.highLevelRequirements ?? "",
    deliverables: p.deliverables ?? "",
    successCriteria: p.successCriteria ?? "",
    stakeholders: p.stakeholders ?? "",
    assumptionsRisks: p.assumptionsRisks ?? "",
    risks: p.risks ?? "",
    integratedSystems: p.integratedSystems ?? "",
    highLevelArchitecture: p.highLevelArchitecture ?? "",
    internalSupportNeeds: p.internalSupportNeeds ?? "",
    roiExpected: p.roiExpected ?? "",
    totalFundingRequired: p.totalFundingRequired ?? 0,
    charterApprovedBy: p.charterApprovedBy ?? "",
    charterApprovedAt: formatDateInput(p.charterApprovedAt),
  });

  const materialCost = detail.costItems.filter((c) => c.category === "MATERIAL").reduce((s, c) => s + c.amount, 0);
  const implementationCost = p.budgetPlanned ?? 0;
  const ongoingSupportCost = p.ongoingSupportMonthlyCost ?? 0;

  async function regenerateDiagram() {
    setRegeneratingDiagram(true);
    await fetch("/api/ai/technical-recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: p.id }),
    });
    setRegeneratingDiagram(false);
    router.refresh();
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
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
          highLevelRequirements: sections["High-Level Requirements"] ?? f.highLevelRequirements,
          deliverables: sections["Deliverables"] ?? f.deliverables,
          successCriteria: sections["Success Criteria"] ?? f.successCriteria,
          stakeholders: sections["Stakeholders"] ?? f.stakeholders,
          assumptionsRisks: sections["Assumptions & Risks"] ?? f.assumptionsRisks,
          risks: sections["Risks"] ?? f.risks,
          integratedSystems: sections["Integrated Systems"] ?? f.integratedSystems,
          highLevelArchitecture: sections["High-Level Architecture"] ?? f.highLevelArchitecture,
          internalSupportNeeds: sections["Internal Support Needs"] ?? f.internalSupportNeeds,
          roiExpected: sections["ROI to Be Achieved"] ?? f.roiExpected,
          totalFundingRequired: parseFundingNumber(sections["Total Funding Required"]) ?? f.totalFundingRequired,
        }));
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card title="Options Considered">
        <p className="text-xs text-slate-500 mb-3">
          A read-only rollup from Inception &amp; Ideation — what was explored before this direction was chosen.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          <SummaryStat label="Brainstorm entries" value={`${detail.brainstormEntries.length}`} />
          <SummaryStat label="Solution options compared" value={`${detail.solutionOptions.length}`} />
          <SummaryStat label="Technical review" value={p.technicalReviewStatus ?? "Not reviewed"} />
        </div>
        {detail.solutionOptions.length > 0 && (
          <ul className="text-xs text-slate-600 space-y-1 mb-3 list-disc pl-4">
            {detail.solutionOptions.map((o) => (
              <li key={o.id}>
                <span className={o.isSelected ? "font-semibold text-emerald-700" : ""}>{o.name}</span>
                {o.isSelected ? " — selected" : ""}
                {o.description ? `: ${o.description}` : ""}
              </li>
            ))}
          </ul>
        )}
        {p.ideationAlignment && (
          <div className="mb-2">
            <p className="text-[11px] font-medium text-slate-500 mb-0.5">Why this direction was chosen</p>
            <p className="text-xs text-slate-600 whitespace-pre-wrap">{p.ideationAlignment}</p>
          </div>
        )}
        {p.recommendedTechnology && (
          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-0.5">Why this technical solution was chosen</p>
            <p className="text-xs text-slate-600"><span className="font-semibold">{p.recommendedTechnology}</span></p>
            {p.technicalRecommendationRationale && (
              <p className="text-xs text-slate-600 whitespace-pre-wrap mt-0.5">{p.technicalRecommendationRationale}</p>
            )}
          </div>
        )}
      </Card>

      <Card title="Cost Summary">
        <p className="text-xs text-slate-500 mb-3">
          Rolled up from the Tasks (implementation) and Ongoing Support estimates — edit those to change these numbers.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryStat label="Material cost" value={`$${materialCost.toLocaleString()}`} />
          <SummaryStat label="Implementation cost" value={`$${implementationCost.toLocaleString()}`} />
          <SummaryStat label="Ongoing support (monthly)" value={`$${ongoingSupportCost.toLocaleString()}`} />
        </div>
      </Card>

      <Card
        title="Project Charter"
        action={
          <div className="flex items-center gap-2">
            <DownloadPdfLink href={`/api/projects/${p.id}/charter-pdf`} filename={`${p.name || "charter"}.pdf`} />
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
          <AiWaitIndicator
            active={generating}
            messages={["Reading the project context...", "Drafting scope and requirements...", "Working out costs and internal needs..."]}
          />
          <Field label="Business case">
            <textarea value={form.businessCase} onChange={(e) => update("businessCase", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Objectives">
            <textarea value={form.objectives} onChange={(e) => update("objectives", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="In scope">
              <textarea value={form.scopeInScope} onChange={(e) => update("scopeInScope", e.target.value)} className={inputCls} rows={2} />
            </Field>
            <Field label="Out of scope">
              <textarea value={form.scopeOutOfScope} onChange={(e) => update("scopeOutOfScope", e.target.value)} className={inputCls} rows={2} />
            </Field>
          </div>
          <Field label="High-level user requirements">
            <textarea
              value={form.highLevelRequirements}
              onChange={(e) => update("highLevelRequirements", e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="The major things the solution must do, from the user's/business's perspective — not implementation detail"
            />
          </Field>
          <Field label="Deliverables">
            <textarea value={form.deliverables} onChange={(e) => update("deliverables", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Success criteria">
            <textarea value={form.successCriteria} onChange={(e) => update("successCriteria", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Stakeholders">
            <textarea value={form.stakeholders} onChange={(e) => update("stakeholders", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Assumptions">
            <textarea value={form.assumptionsRisks} onChange={(e) => update("assumptionsRisks", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Key risks">
            <textarea
              value={form.risks}
              onChange={(e) => update("risks", e.target.value)}
              className={inputCls}
              rows={2}
              placeholder="High-level risks to the project's success — see the Risks tab for the detailed, tracked risk register."
            />
          </Field>
          <Field label="Integrated systems">
            <textarea
              value={form.integratedSystems}
              onChange={(e) => update("integratedSystems", e.target.value)}
              className={inputCls}
              rows={2}
              placeholder="Systems this project connects to or depends on (e.g. Salesforce, SAP, internal auth service)"
            />
          </Field>
          <Field label="High-level architecture">
            <textarea
              value={form.highLevelArchitecture}
              onChange={(e) => update("highLevelArchitecture", e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="Describe the major components/layers and how they fit together"
            />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-xs font-medium text-slate-500">Architecture diagram (AI-generated)</span>
              <button
                type="button"
                onClick={regenerateDiagram}
                disabled={regeneratingDiagram}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
              >
                {regeneratingDiagram ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                {p.architectureDiagram ? "Regenerate" : "Generate"}
              </button>
            </div>
            <AiWaitIndicator active={regeneratingDiagram} messages={["Reading the architecture description...", "Drawing the diagram..."]} className="mb-2" />
            {p.architectureDiagram ? (
              <MermaidDiagram chart={p.architectureDiagram} />
            ) : (
              <p className="text-xs text-slate-400">
                No diagram yet — generate one, or draft the recommendation from the Inception &amp; Ideation tab.
              </p>
            )}
          </div>

          <Field label="Internal support needs">
            <textarea
              value={form.internalSupportNeeds}
              onChange={(e) => update("internalSupportNeeds", e.target.value)}
              className={inputCls}
              rows={2}
              placeholder="What's needed from internal teams (IT, security, compliance, data, etc.) to execute this project"
            />
          </Field>

          <Field label="ROI to be achieved">
            <textarea
              value={form.roiExpected}
              onChange={(e) => update("roiExpected", e.target.value)}
              className={inputCls}
              rows={2}
              placeholder="Expected return on investment — cost savings, revenue impact, efficiency gains, and timeframe"
            />
          </Field>
          <Field label="Total funding required ($)">
            <input
              type="number"
              min={0}
              value={form.totalFundingRequired}
              onChange={(e) => update("totalFundingRequired", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 text-center bg-white">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
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

// Best-effort extraction of a dollar figure from the AI's free-text funding section
// (e.g. "$120,000" or "Approximately 85000 USD" -> 120000 / 85000). Returns null if
// nothing number-like is found, so the existing value is left alone rather than zeroed out.
function parseFundingNumber(text: string | undefined): number | null {
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}
