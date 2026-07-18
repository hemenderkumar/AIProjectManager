"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import { Sparkles, Loader2, Plus, Trash2, Copy, CheckCircle2, Trophy, Send } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";
import DownloadPdfLink from "@/components/DownloadPdfLink";

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

type Rfp = {
  id: string; title: string; status: string; projectId: string | null;
  background: string | null; scope: string | null; requirements: string | null;
  timeline: string | null; budgetRange: string | null; content: string | null;
  createdByAi: boolean; publishedAt: string | null;
};
type Criterion = { id: string; name: string; weightPercent: number };
type Score = { criterionId: string; score: number; rationale: string | null };
type Vendor = {
  id: string; name: string; contactName: string | null; contactEmail: string; token: string;
  status: string; responseText: string | null; proposedCost: number | null; proposedTimelineWeeks: number | null;
  submittedAt: string | null; scores: Score[];
};
type Recommendation = { recommendedVendorId: string | null; summary: string | null; generatedAt: string };
type Detail = {
  rfp: Rfp; project: { id: string; name: string; hasCharter: boolean } | null;
  criteria: Criterion[]; vendors: Vendor[]; recommendation: Recommendation | null;
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PUBLISHED: "bg-accent-50 text-accent-700",
  EVALUATING: "bg-amber-50 text-amber-700",
  AWARDED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-500",
};
const VENDOR_STATUS_STYLES: Record<string, string> = {
  INVITED: "bg-slate-100 text-slate-600",
  VIEWED: "bg-accent-50 text-accent-700",
  SUBMITTED: "bg-emerald-50 text-emerald-700",
  DECLINED: "bg-rose-50 text-rose-600",
};

export default function RfpDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  const [docForm, setDocForm] = useState({ title: "", background: "", scope: "", requirements: "", timeline: "", budgetRange: "", content: "" });
  const [savingDoc, setSavingDoc] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [criterionForm, setCriterionForm] = useState({ name: "", weightPercent: "" });
  const [criterionSaving, setCriterionSaving] = useState(false);

  const [vendorForm, setVendorForm] = useState({ name: "", contactName: "", contactEmail: "" });
  const [vendorSaving, setVendorSaving] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rfps/${id}`);
    if (res.ok) {
      const data: Detail = await res.json();
      setDetail(data);
      setDocForm({
        title: data.rfp.title, background: data.rfp.background ?? "", scope: data.rfp.scope ?? "",
        requirements: data.rfp.requirements ?? "", timeline: data.rfp.timeline ?? "",
        budgetRange: data.rfp.budgetRange ?? "", content: data.rfp.content ?? "",
      });
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function saveDoc() {
    setSavingDoc(true);
    await fetch(`/api/rfps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(docForm),
    });
    setSavingDoc(false);
    load();
  }

  async function draftWithAi() {
    setDrafting(true);
    setDraftError(null);
    try {
      // Save the pointer fields first so the draft is grounded in whatever the owner just typed.
      await fetch(`/api/rfps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(docForm),
      });
      const res = await fetch(`/api/rfps/${id}/draft`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDraftError(data?.error ?? "Drafting failed.");
        return;
      }
      setDocForm((f) => ({ ...f, content: data.content ?? "" }));
    } finally {
      setDrafting(false);
    }
  }

  async function publish() {
    setPublishing(true);
    await fetch(`/api/rfps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "PUBLISHED" }),
    });
    setPublishing(false);
    load();
  }

  async function addCriterion(e: React.FormEvent) {
    e.preventDefault();
    if (!criterionForm.name.trim()) return;
    setCriterionSaving(true);
    await fetch(`/api/rfps/${id}/criteria`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: criterionForm.name, weightPercent: Number(criterionForm.weightPercent) || 0 }),
    });
    setCriterionForm({ name: "", weightPercent: "" });
    setCriterionSaving(false);
    load();
  }

  async function removeCriterion(cid: string) {
    await fetch(`/api/rfps/${id}/criteria/${cid}`, { method: "DELETE" });
    load();
  }

  async function inviteVendor(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorForm.name.trim() || !vendorForm.contactEmail.trim()) return;
    setVendorSaving(true);
    setVendorError(null);
    try {
      const res = await fetch(`/api/rfps/${id}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vendorForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setVendorError(data?.error ?? "Couldn't invite this vendor.");
        return;
      }
      setVendorForm({ name: "", contactName: "", contactEmail: "" });
      load();
    } finally {
      setVendorSaving(false);
    }
  }

  async function removeVendor(vid: string) {
    await fetch(`/api/rfps/${id}/vendors/${vid}`, { method: "DELETE" });
    load();
  }

  function copyLink(vendor: Vendor) {
    const link = `${window.location.origin}/rfp/respond/${vendor.token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(vendor.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function runEvaluation() {
    setEvaluating(true);
    setEvalError(null);
    try {
      const res = await fetch(`/api/rfps/${id}/evaluate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setEvalError(data?.error ?? "Evaluation failed.");
        return;
      }
      load();
    } finally {
      setEvaluating(false);
    }
  }

  if (loading || !detail) {
    return (
      <div>
        <Topbar title="Vendor Evaluation" subtitle="Loading..." />
        <div className="p-8"><Loader2 className="animate-spin text-slate-400" /></div>
      </div>
    );
  }

  const { rfp, project, criteria, vendors, recommendation } = detail;
  const totalWeight = criteria.reduce((s, c) => s + (c.weightPercent || 0), 0);
  const submittedVendors = vendors.filter((v) => v.status === "SUBMITTED");
  const hasScores = vendors.some((v) => v.scores.length > 0);

  function weightedTotal(vendor: Vendor) {
    if (criteria.length === 0) return 0;
    return criteria.reduce((sum, c) => {
      const s = vendor.scores.find((sc) => sc.criterionId === c.id);
      return sum + (s ? s.score * (c.weightPercent / 100) : 0);
    }, 0);
  }

  return (
    <div>
      <Topbar
        title={rfp.title}
        subtitle={project ? `Linked to project: ${project.name}` : "Standalone RFP"}
        action={
          <button onClick={() => router.push("/vendor-evaluation")} className="text-xs text-slate-500 hover:text-slate-700">
            ← All RFPs
          </button>
        }
      />
      <div className="p-8 max-w-4xl space-y-6">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[rfp.status] ?? "bg-slate-100 text-slate-600"}`}>{rfp.status}</span>
          {rfp.status === "DRAFT" && (
            <button
              onClick={publish}
              disabled={publishing || !docForm.content.trim()}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 disabled:opacity-50"
              title={!docForm.content.trim() ? "Draft or write the RFP content before publishing" : undefined}
            >
              <Send size={12} /> {publishing ? "Publishing..." : "Publish"}
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">RFP Document</p>
            <div className="flex items-center gap-2">
              {rfp.content && (
                <DownloadPdfLink href={`/api/rfps/${id}/pdf`} filename={`${rfp.title || "rfp"}.pdf`} />
              )}
              <button
                onClick={draftWithAi}
                disabled={drafting}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
              >
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {rfp.content ? "Regenerate with AI" : "Draft with AI"}
              </button>
            </div>
          </div>
          <AiWaitIndicator active={drafting} messages={["Reading the project context...", "Drafting the RFP document..."]} />
          {project?.hasCharter && (
            <p className="text-xs text-emerald-700">This project has a completed charter — AI will draft from it directly.</p>
          )}
          {!project?.hasCharter && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Background</span>
                <textarea value={docForm.background} onChange={(e) => setDocForm((f) => ({ ...f, background: e.target.value }))} className={inputCls} rows={2} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Scope</span>
                <textarea value={docForm.scope} onChange={(e) => setDocForm((f) => ({ ...f, scope: e.target.value }))} className={inputCls} rows={2} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Requirements</span>
                <textarea value={docForm.requirements} onChange={(e) => setDocForm((f) => ({ ...f, requirements: e.target.value }))} className={inputCls} rows={2} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Timeline</span>
                <input value={docForm.timeline} onChange={(e) => setDocForm((f) => ({ ...f, timeline: e.target.value }))} className={inputCls} />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Budget range</span>
                <input value={docForm.budgetRange} onChange={(e) => setDocForm((f) => ({ ...f, budgetRange: e.target.value }))} className={inputCls} />
              </label>
            </div>
          )}
          {draftError && <p className="text-xs text-rose-600">{draftError}</p>}
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Full RFP content (what vendors see)</span>
            <textarea value={docForm.content} onChange={(e) => setDocForm((f) => ({ ...f, content: e.target.value }))} className={inputCls} rows={12} />
          </label>
          <div>
            <button onClick={saveDoc} disabled={savingDoc} className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
              {savingDoc ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900">Scoring Rubric {totalWeight !== 100 && totalWeight > 0 && <span className="text-xs font-normal text-amber-600">(weights total {totalWeight}%, not 100%)</span>}</p>
          {criteria.length > 0 && (
            <ul className="space-y-1.5">
              {criteria.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm text-slate-700 border-b border-slate-50 pb-1.5">
                  <span>{c.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">{c.weightPercent}%</span>
                    <button onClick={() => removeCriterion(c.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addCriterion} className="flex items-end gap-3">
            <label className="block flex-1">
              <span className="block text-xs font-medium text-slate-500 mb-1">Criterion name</span>
              <input value={criterionForm.name} onChange={(e) => setCriterionForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Technical Fit" />
            </label>
            <label className="block w-28">
              <span className="block text-xs font-medium text-slate-500 mb-1">Weight %</span>
              <input type="number" value={criterionForm.weightPercent} onChange={(e) => setCriterionForm((f) => ({ ...f, weightPercent: e.target.value }))} className={inputCls} />
            </label>
            <button type="submit" disabled={criterionSaving} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 text-sm font-medium disabled:opacity-50">
              <Plus size={14} /> Add
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900">Vendors</p>
          {vendors.length > 0 && (
            <div className="space-y-2">
              {vendors.map((v) => (
                <div key={v.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{v.name}</p>
                      <p className="text-xs text-slate-500">{v.contactName ? `${v.contactName} · ` : ""}{v.contactEmail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${VENDOR_STATUS_STYLES[v.status] ?? "bg-slate-100 text-slate-600"}`}>{v.status}</span>
                      <button onClick={() => copyLink(v)} className="text-slate-400 hover:text-accent-600" title="Copy response link">
                        {copiedId === v.id ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                      <button onClick={() => removeVendor(v.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {v.status === "SUBMITTED" && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                      {v.proposedCost != null && <p>Proposed cost: ${v.proposedCost.toLocaleString()}</p>}
                      {v.proposedTimelineWeeks != null && <p>Proposed timeline: {v.proposedTimelineWeeks} weeks</p>}
                      {v.responseText && <p className="whitespace-pre-wrap text-slate-500">{v.responseText}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {vendorError && <p className="text-xs text-rose-600">{vendorError}</p>}
          <form onSubmit={inviteVendor} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Vendor / company name</span>
              <input value={vendorForm.name} onChange={(e) => setVendorForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Contact name</span>
              <input value={vendorForm.contactName} onChange={(e) => setVendorForm((f) => ({ ...f, contactName: e.target.value }))} className={inputCls} />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-500 mb-1">Contact email</span>
              <input type="email" value={vendorForm.contactEmail} onChange={(e) => setVendorForm((f) => ({ ...f, contactEmail: e.target.value }))} className={inputCls} />
            </label>
            <div className="col-span-3">
              <button type="submit" disabled={vendorSaving} className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50">
                <Plus size={14} /> {vendorSaving ? "Inviting..." : "Invite Vendor"}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">AI Evaluation & Recommendation</p>
            <button
              onClick={runEvaluation}
              disabled={evaluating || criteria.length === 0 || submittedVendors.length === 0}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
              title={criteria.length === 0 ? "Add at least one scoring criterion first" : submittedVendors.length === 0 ? "Waiting on vendor submissions" : undefined}
            >
              {evaluating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {evaluating ? "Evaluating..." : hasScores ? "Re-run Evaluation" : "Evaluate Vendors"}
            </button>
          </div>
          <AiWaitIndicator active={evaluating} messages={["Reading vendor responses...", "Scoring against your rubric...", "Drafting a recommendation..."]} />
          {evalError && <p className="text-xs text-rose-600">{evalError}</p>}

          {hasScores && criteria.length > 0 && submittedVendors.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="py-1.5 pr-3">Vendor</th>
                    {criteria.map((c) => (
                      <th key={c.id} className="py-1.5 pr-3">{c.name} ({c.weightPercent}%)</th>
                    ))}
                    <th className="py-1.5 pr-3">Weighted Total</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedVendors.map((v) => (
                    <tr key={v.id} className={`border-b border-slate-50 ${recommendation?.recommendedVendorId === v.id ? "bg-emerald-50/50" : ""}`}>
                      <td className="py-1.5 pr-3 font-medium text-slate-800">
                        {v.name}
                        {recommendation?.recommendedVendorId === v.id && <Trophy size={12} className="inline ml-1 text-emerald-600" />}
                      </td>
                      {criteria.map((c) => {
                        const s = v.scores.find((sc) => sc.criterionId === c.id);
                        return <td key={c.id} className="py-1.5 pr-3 text-slate-600" title={s?.rationale ?? ""}>{s ? s.score.toFixed(1) : "—"}</td>;
                      })}
                      <td className="py-1.5 pr-3 font-semibold text-slate-900">{weightedTotal(v).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {recommendation?.summary && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm text-emerald-900">
              <p className="font-semibold mb-1 flex items-center gap-1.5"><Trophy size={14} /> Recommendation</p>
              <p className="whitespace-pre-wrap">{recommendation.summary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
