"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateInput } from "@/lib/format";
import { Sparkles, Loader2, CheckCircle2, ShieldCheck, Download } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";
import AiEditChat from "./AiEditChat";

// Plan sub-tab, between Architecture and Scope & Charter — the idea-evaluation deliverable:
// "should we do this and why," reviewed before Charter's "here's the authorized scope/cost/
// plan to execute it." Problem We're Solving is read-only here (owned by Idea & Alignment) —
// everything else (Business Case narrative, SWOT, Market Analysis & Prediction, Revenue
// Projections, Roadmap) is edited here and downloadable as a Business Case PowerPoint deck.
// Gate: businessCaseApprovedAt set (see the generic PATCH route's gate-transition logic in
// api/projects/[id]/route.ts) — same PM+ approval bar as Architecture and Charter.
export default function BusinessCaseWorkspace({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const p = detail.project;

  const [form, setForm] = useState({
    businessCase: p.businessCase ?? "",
    swotStrengths: p.swotStrengths ?? "",
    swotWeaknesses: p.swotWeaknesses ?? "",
    swotOpportunities: p.swotOpportunities ?? "",
    swotThreats: p.swotThreats ?? "",
    marketAnalysis: p.marketAnalysis ?? "",
    marketPrediction: p.marketPrediction ?? "",
    revenueProjections: p.revenueProjections ?? "",
    businessRoadmap: p.businessRoadmap ?? "",
    businessCaseApprovedBy: p.businessCaseApprovedBy ?? "",
    businessCaseApprovedAt: formatDateInput(p.businessCaseApprovedAt),
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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
      setSaveError(data?.error ?? "Could not save — please try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function generateWithAi() {
    setGenerating(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/business-case-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiError(data?.error ?? "Couldn't draft the business case with AI.");
        return;
      }
      const proj = data.project ?? {};
      setForm((f) => ({
        ...f,
        businessCase: proj.businessCase ?? f.businessCase,
        swotStrengths: proj.swotStrengths ?? f.swotStrengths,
        swotWeaknesses: proj.swotWeaknesses ?? f.swotWeaknesses,
        swotOpportunities: proj.swotOpportunities ?? f.swotOpportunities,
        swotThreats: proj.swotThreats ?? f.swotThreats,
        marketAnalysis: proj.marketAnalysis ?? f.marketAnalysis,
        marketPrediction: proj.marketPrediction ?? f.marketPrediction,
        revenueProjections: proj.revenueProjections ?? f.revenueProjections,
        businessRoadmap: proj.businessRoadmap ?? f.businessRoadmap,
        // A fresh draft clears any prior approval server-side — reflect that here too.
        businessCaseApprovedBy: "",
        businessCaseApprovedAt: "",
      }));
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function downloadPptx() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const saved = await save();
      if (!saved) {
        setDownloadError("Couldn't save before downloading — see the error above.");
        return;
      }
      const res = await fetch(`/api/projects/${p.id}/business-case-pptx`);
      if (!res.ok) {
        let message = `Couldn't generate the deck (server returned ${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // not a JSON error body
        }
        setDownloadError(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = (p.name || "business-case").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
      a.download = `${slug}-business-case.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Couldn't reach the server to generate the deck. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  // The AI-edit-chat below patches the project directly via /api/projects/[id] — merge whichever
  // of its changed keys happen to overlap this form's local state (all the Business Case fields
  // do) so they update immediately without waiting on a full page reload, then refresh so the
  // approval banner and anything else derived server-side picks it up too. Mirrors
  // handleCharterAiApplied in CharterTab.tsx.
  function handleBusinessCaseAiApplied(changes: Record<string, unknown>) {
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

  const approved = Boolean(p.businessCaseApprovedAt);

  return (
    <div className="space-y-6 max-w-3xl">
      {approved && (
        <p className="text-sm text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 size={15} /> Business Case approved by {p.businessCaseApprovedBy} — Scope &amp; Charter is unlocked below.
        </p>
      )}

      <Card
        title="Draft the Business Case with AI"
        action={
          <button
            onClick={generateWithAi}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {form.businessCase ? "Regenerate" : "Generate"}
          </button>
        }
      >
        <AiWaitIndicator active={generating} messages={["Reading the problem and feasibility notes...", "Reasoning about SWOT and market dynamics...", "Drafting revenue scenarios and a roadmap..."]} className="mb-2" />
        {aiError && <p className="text-xs text-rose-600 mb-2">{aiError}</p>}
        <p className="text-xs text-slate-400">
          Grounds the business case in the problem, proposed solution, feasibility notes, and any pricing/volume
          already captured — never invents real competitor names or market statistics. Review and edit everything
          below before approving.
        </p>
      </Card>

      <Card title="Refine with AI">
        <p className="text-xs text-slate-400 mb-2">
          Describe a change in plain language — e.g. &quot;sharpen the threats to call out competitor
          reaction&quot; or &quot;make the revenue projection more conservative.&quot; Review the proposed
          diff before it&apos;s applied.
        </p>
        <AiEditChat
          entityType="project"
          entityId={p.id}
          onApplied={handleBusinessCaseAiApplied}
          placeholder='e.g. "tighten the SWOT weaknesses" or "add a roadmap step for a pilot batch"'
        />
      </Card>

      <Card title="Problem we're solving">
        <p className="text-xs text-slate-400 mb-2">Set in Idea &amp; Alignment — edit it there.</p>
        <p className="text-sm text-slate-600 whitespace-pre-wrap">{p.problemStatement?.trim() || "—"}</p>
      </Card>

      <Card title="Business case">
        <Field label="Why this is worth doing, and why this solution wins">
          <textarea
            value={form.businessCase}
            onChange={(e) => update("businessCase", e.target.value)}
            className={inputCls}
            rows={4}
            placeholder="The case for pursuing this idea"
          />
        </Field>
      </Card>

      <Card title="SWOT Analysis">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Strengths">
            <textarea value={form.swotStrengths} onChange={(e) => update("swotStrengths", e.target.value)} className={inputCls} rows={4} placeholder="- Internal advantages of this idea/approach" />
          </Field>
          <Field label="Weaknesses">
            <textarea value={form.swotWeaknesses} onChange={(e) => update("swotWeaknesses", e.target.value)} className={inputCls} rows={4} placeholder="- Internal gaps/risks of this idea/approach" />
          </Field>
          <Field label="Opportunities">
            <textarea value={form.swotOpportunities} onChange={(e) => update("swotOpportunities", e.target.value)} className={inputCls} rows={4} placeholder="- External factors this idea could exploit" />
          </Field>
          <Field label="Threats">
            <textarea value={form.swotThreats} onChange={(e) => update("swotThreats", e.target.value)} className={inputCls} rows={4} placeholder="- External factors that could hurt this idea" />
          </Field>
        </div>
      </Card>

      <Card title="Market Analysis & Prediction">
        <Field label="Market analysis (quick read: buyer, alternatives today, why now)">
          <textarea value={form.marketAnalysis} onChange={(e) => update("marketAnalysis", e.target.value)} className={inputCls} rows={3} />
        </Field>
        <div className="mt-4">
          <Field label="Market prediction (how this space evolves over 1-3 years)">
            <textarea value={form.marketPrediction} onChange={(e) => update("marketPrediction", e.target.value)} className={inputCls} rows={3} />
          </Field>
        </div>
      </Card>

      <Card title="Revenue Projections">
        <p className="text-xs text-slate-400 mb-2">
          Grounded in Charter&apos;s quoted unit price and target monthly volume when both are set — otherwise
          qualitative only.
        </p>
        <Field label="Projection">
          <textarea value={form.revenueProjections} onChange={(e) => update("revenueProjections", e.target.value)} className={inputCls} rows={4} />
        </Field>
      </Card>

      <Card title="Roadmap">
        <Field label="Sequenced steps from here to launch (quick wins vs. longer-term)">
          <textarea value={form.businessRoadmap} onChange={(e) => update("businessRoadmap", e.target.value)} className={inputCls} rows={4} />
        </Field>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</PrimaryButton>
        <button
          onClick={downloadPptx}
          disabled={downloading}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 font-medium"
        >
          {downloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {downloading ? "Generating..." : "Download as PowerPoint"}
        </button>
      </div>
      {saveError && <p className="text-xs text-rose-600">{saveError}</p>}
      {downloadError && <p className="text-xs text-rose-600">{downloadError}</p>}

      <Card title="Business Case Approval">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={13} className="text-slate-500" />
          <p className="text-xs text-slate-500">
            Confirms the case above is sound enough to move into formal Scope &amp; Charter drafting.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
          <Field label="Approved by">
            <input value={form.businessCaseApprovedBy} onChange={(e) => update("businessCaseApprovedBy", e.target.value)} className={inputCls} placeholder="Approver name" />
          </Field>
          <Field label="Approved on">
            <input type="date" value={form.businessCaseApprovedAt} onChange={(e) => update("businessCaseApprovedAt", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="text-xs px-3 py-1.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save approval"}
        </button>
        {saveError && <p className="mt-2 text-xs text-rose-600">{saveError}</p>}
      </Card>
    </div>
  );
}
