"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateInput } from "@/lib/format";
import { Sparkles, Loader2, FileDown, Download } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";
import MermaidDiagram from "@/components/MermaidDiagram";
import AiEditChat from "./AiEditChat";
import { renderMermaidToImages } from "@/lib/mermaidToImage";

export default function CharterTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const p = detail.project;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genDraftError, setGenDraftError] = useState<string | null>(null);
  const [regeneratingDiagram, setRegeneratingDiagram] = useState(false);
  const [form, setForm] = useState({
    executiveSummary: p.executiveSummary ?? "",
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
    // Falls back to the itemized cost-items total (from the Tasks-tab plan wizard) until
    // someone edits or AI-drafts this project-level figure directly — after that, this
    // column is the source of truth for what Cost Summary shows, so existing data isn't
    // lost but a fresh save always wins.
    materialCostEstimate:
      p.materialCostEstimate ?? detail.costItems.filter((c) => c.category === "MATERIAL").reduce((s, c) => s + c.amount, 0),
    budgetPlanned: p.budgetPlanned ?? 0,
    ongoingSupportMonthlyCost: p.ongoingSupportMonthlyCost ?? 0,
    contingencyPercent: p.contingencyPercent ?? 10,
    charterApprovedBy: p.charterApprovedBy ?? "",
    charterApprovedAt: formatDateInput(p.charterApprovedAt),
  });

  // Applied to both cost and effort so the buffer shows up wherever someone is sizing the
  // project, not just in the dollar total — a schedule built off "best case" hours alone is
  // exactly what a contingency margin exists to protect against.
  const costSubtotal = (form.materialCostEstimate || 0) + (form.budgetPlanned || 0);
  const contingencyAmount = Math.round((costSubtotal * (form.contingencyPercent || 0)) / 100);
  const totalWithContingency = costSubtotal + contingencyAmount;
  const totalEstimateHours = detail.tasks.reduce((s, t) => s + (t.estimateHours ?? 0), 0);
  const effortWithContingency = totalEstimateHours * (1 + (form.contingencyPercent || 0) / 100);

  const [downloadingWord, setDownloadingWord] = useState(false);
  const [downloadWordError, setDownloadWordError] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadPdfError, setDownloadPdfError] = useState<string | null>(null);

  // Both exports read from the persisted project row, not this component's local `form`
  // state -- so any AI-drafted or hand-edited value (cost figures, executive summary, etc.)
  // that hasn't been saved yet would otherwise show correctly on screen but as 0/blank in the
  // downloaded document. Saving right before generating either file closes that gap instead
  // of relying on someone remembering to hit "Save Charter" first.
  async function persistCharter(): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data?.error ?? "Could not save the charter. Please try again." };
    }
    return { ok: true };
  }

  async function downloadCharterWord() {
    setDownloadingWord(true);
    setDownloadWordError(null);
    try {
      const saved = await persistCharter();
      if (!saved.ok) {
        setDownloadWordError(`Couldn't save the charter before downloading: ${saved.error}`);
        return;
      }
      const diagram = p.architectureDiagram?.trim() ? await renderMermaidToImages(p.architectureDiagram) : null;
      const res = await fetch(`/api/projects/${p.id}/charter-docx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagram }),
      });
      if (!res.ok) {
        let message = `Couldn't generate the Word document (server returned ${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // not a JSON error body — keep the generic message
        }
        setDownloadWordError(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (p.name || "charter").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
      a.download = `${slug}-charter.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch {
      setDownloadWordError("Couldn't reach the server to generate the Word document. Check your connection and try again.");
    } finally {
      setDownloadingWord(false);
    }
  }

  async function downloadCharterPdf() {
    setDownloadingPdf(true);
    setDownloadPdfError(null);
    try {
      const saved = await persistCharter();
      if (!saved.ok) {
        setDownloadPdfError(`Couldn't save the charter before downloading: ${saved.error}`);
        return;
      }
      const diagram = p.architectureDiagram?.trim() ? await renderMermaidToImages(p.architectureDiagram) : null;
      const res = await fetch(`/api/projects/${p.id}/charter-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagram }),
      });
      if (!res.ok) {
        let message = `Couldn't generate the PDF (server returned ${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // not a JSON error body — keep the generic message
        }
        setDownloadPdfError(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (p.name || "charter").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
      a.download = `${slug}-charter.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch {
      setDownloadPdfError("Couldn't reach the server to generate the PDF. Check your connection and try again.");
    } finally {
      setDownloadingPdf(false);
    }
  }

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

  // The AI-edit-chat below patches the project directly via /api/projects/[id] — merge
  // whichever of its changed keys happen to overlap this form's local state (most do,
  // e.g. businessCase/objectives/risks) so the fields update immediately without waiting
  // on a full page reload, then refresh so any read-only rollups elsewhere pick it up too.
  function handleCharterAiApplied(changes: Record<string, unknown>) {
    setForm((f) => {
      const next = { ...f };
      for (const key of Object.keys(changes)) {
        if (key in next) {
          (next as Record<string, unknown>)[key] = changes[key];
        }
      }
      return next;
    });
    router.refresh();
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const result = await persistCharter();
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    router.refresh();
  }

  async function generateDraft() {
    setGenerating(true);
    setGenDraftError(null);
    try {
      const res = await fetch("/api/ai/generate-charter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenDraftError(data?.error ?? "Couldn't draft the charter. Please try again.");
        return;
      }
      // Field names come back matching form state 1:1 (see generate-charter's
      // DraftCharterResult type) -- no parsing layer, so nothing silently fails to map.
      setForm((f) => ({
        ...f,
        executiveSummary: data.executiveSummary ?? f.executiveSummary,
        businessCase: data.businessCase ?? f.businessCase,
        objectives: data.objectives ?? f.objectives,
        scopeInScope: data.scopeInScope ?? f.scopeInScope,
        scopeOutOfScope: data.scopeOutOfScope ?? f.scopeOutOfScope,
        highLevelRequirements: data.highLevelRequirements ?? f.highLevelRequirements,
        deliverables: data.deliverables ?? f.deliverables,
        successCriteria: data.successCriteria ?? f.successCriteria,
        stakeholders: data.stakeholders ?? f.stakeholders,
        assumptionsRisks: data.assumptionsRisks ?? f.assumptionsRisks,
        risks: data.risks ?? f.risks,
        integratedSystems: data.integratedSystems ?? f.integratedSystems,
        highLevelArchitecture: data.highLevelArchitecture ?? f.highLevelArchitecture,
        internalSupportNeeds: data.internalSupportNeeds ?? f.internalSupportNeeds,
        roiExpected: data.roiExpected ?? f.roiExpected,
        materialCostEstimate: typeof data.materialCostEstimate === "number" ? data.materialCostEstimate : f.materialCostEstimate,
        budgetPlanned: typeof data.budgetPlanned === "number" ? data.budgetPlanned : f.budgetPlanned,
        ongoingSupportMonthlyCost: typeof data.ongoingSupportMonthlyCost === "number" ? data.ongoingSupportMonthlyCost : f.ongoingSupportMonthlyCost,
        totalFundingRequired: typeof data.totalFundingRequired === "number" ? data.totalFundingRequired : f.totalFundingRequired,
      }));
    } catch {
      setGenDraftError("Couldn't reach the server to draft the charter. Check your connection and try again.");
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
            <p className="text-xs font-medium text-slate-500 mb-0.5">Why this direction was chosen</p>
            <p className="text-xs text-slate-600 whitespace-pre-wrap">{p.ideationAlignment}</p>
          </div>
        )}
        {p.recommendedTechnology && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-0.5">Why this technical solution was chosen</p>
            <p className="text-xs text-slate-600"><span className="font-semibold">{p.recommendedTechnology}</span></p>
            {p.technicalRecommendationRationale && (
              <p className="text-xs text-slate-600 whitespace-pre-wrap mt-0.5">{p.technicalRecommendationRationale}</p>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Cost Summary"
        action={
          <button
            onClick={generateDraft}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
          >
            {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Estimate with AI
          </button>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          Editable directly here, or estimated by AI from the project&apos;s scope and technology — save the
          Charter below once you&apos;re happy with the numbers.
        </p>
        <AiWaitIndicator active={generating} messages={["Reading the scope and technology...", "Estimating costs..."]} className="mb-2" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
          <Field label="Material cost ($)">
            <input
              type="number"
              min={0}
              value={form.materialCostEstimate}
              onChange={(e) => update("materialCostEstimate", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Implementation cost ($)">
            <input
              type="number"
              min={0}
              value={form.budgetPlanned}
              onChange={(e) => update("budgetPlanned", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Ongoing support ($/month)">
            <input
              type="number"
              min={0}
              value={form.ongoingSupportMonthlyCost}
              onChange={(e) => update("ongoingSupportMonthlyCost", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <Field label="Contingency (%)">
            <input
              type="number"
              min={0}
              max={100}
              value={form.contingencyPercent}
              onChange={(e) => update("contingencyPercent", Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <div className="flex flex-col justify-end pb-0.5">
            <p className="text-xs text-slate-400">
              Applied as a buffer on top of both the cost above and the total effort estimate below — not
              AI-drafted, this is a policy call for whoever owns the budget to set.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryStat label="Cost subtotal" value={`$${costSubtotal.toLocaleString()}`} />
          <SummaryStat label={`Contingency (${form.contingencyPercent}%)`} value={`$${contingencyAmount.toLocaleString()}`} />
          <SummaryStat label="Total incl. contingency" value={`$${totalWithContingency.toLocaleString()}`} />
          <SummaryStat
            label="Total effort incl. contingency"
            value={totalEstimateHours > 0 ? `${Math.round(effortWithContingency).toLocaleString()} hrs` : "No tasks yet"}
          />
        </div>
      </Card>

      <Card
        title="Project Charter"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCharterPdf}
              disabled={downloadingPdf}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {downloadingPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              PDF
            </button>
            <button
              onClick={downloadCharterWord}
              disabled={downloadingWord}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            >
              {downloadingWord ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              Word
            </button>
            <button
              onClick={generateDraft}
              disabled={generating}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Draft with AI
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {downloadPdfError && <p className="text-xs text-rose-600">{downloadPdfError}</p>}
          {downloadWordError && <p className="text-xs text-rose-600">{downloadWordError}</p>}
          {genDraftError && <p className="text-xs text-rose-600">{genDraftError}</p>}
          <AiWaitIndicator
            active={generating}
            messages={["Reading the project context...", "Drafting scope and requirements...", "Working out costs and internal needs..."]}
          />
          <AiEditChat
            entityType="project"
            entityId={p.id}
            onApplied={handleCharterAiApplied}
            placeholder='e.g. "tighten the scope to exclude mobile" or "add a risk about vendor lock-in"'
          />
          <Field label="Executive summary">
            <textarea
              value={form.executiveSummary}
              onChange={(e) => update("executiveSummary", e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="A short, standalone readout for a sponsor or steering committee — what's being asked for, why, and the expected return."
            />
          </Field>
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
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
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
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

