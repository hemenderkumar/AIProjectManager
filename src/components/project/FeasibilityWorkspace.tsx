"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateTime, formatDateInput } from "@/lib/format";
import { Sparkles, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

const TECH_REVIEW_LABELS: Record<string, string> = {
  PENDING: "Pending Review",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested",
};

const TECH_REVIEW_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  CHANGES_REQUESTED: "bg-rose-50 text-rose-700",
};

// Plan sub-tab 2 — confirms the direction is technically sound before anyone spends time on
// a specific architecture diagram. Gate: technicalReviewStatus === "APPROVED" (see the
// generic PATCH route's gate-transition logic in api/projects/[id]/route.ts).
export default function FeasibilityWorkspace({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const p = detail.project;

  const [form, setForm] = useState({
    feasibilityScore: p.feasibilityScore ?? undefined,
    feasibilityNotes: p.feasibilityNotes ?? "",
    currentTechLandscape: p.currentTechLandscape ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [suggestingLandscape, setSuggestingLandscape] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    technicalReviewStatus: p.technicalReviewStatus ?? "",
    technicalReviewedBy: p.technicalReviewedBy ?? "",
    technicalReviewNotes: p.technicalReviewNotes ?? "",
  });
  const [savingReview, setSavingReview] = useState(false);

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

  async function assessFeasibility() {
    setAssessing(true);
    try {
      const res = await fetch("/api/ai/feasibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setForm((f) => ({ ...f, feasibilityScore: data.feasibilityScore, feasibilityNotes: data.technicalApproach }));
      }
    } finally {
      setAssessing(false);
    }
  }

  async function suggestLandscape() {
    setSuggestingLandscape(true);
    try {
      const res = await fetch("/api/ai/current-landscape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (res.ok) update("currentTechLandscape", data.currentTechLandscape);
    } finally {
      setSuggestingLandscape(false);
    }
  }

  async function getTechnicalRecommendation() {
    setRecommending(true);
    setRecommendError(null);
    const res = await fetch("/api/ai/technical-recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: p.id }),
    });
    setRecommending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRecommendError(data?.error ?? "Couldn't generate a technical recommendation.");
      return;
    }
    router.refresh();
  }

  async function saveReview() {
    setSavingReview(true);
    // Save any unsaved feasibility notes/landscape edits together with the review decision,
    // so clicking "Save review" always reflects what's currently on screen.
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        technicalReviewStatus: reviewForm.technicalReviewStatus || null,
        technicalReviewedBy: reviewForm.technicalReviewedBy || null,
        technicalReviewNotes: reviewForm.technicalReviewNotes || null,
        technicalReviewedAt: formatDateInput(new Date()),
      }),
    });
    setSavingReview(false);
    router.refresh();
  }

  const confirmed = p.technicalReviewStatus === "APPROVED";

  return (
    <div className="space-y-6 max-w-3xl">
      {confirmed && (
        <p className="text-sm text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 size={15} /> Feasibility confirmed — Architecture is unlocked below.
        </p>
      )}

      <Card
        title="Feasibility assessment"
        action={
          <button
            onClick={assessFeasibility}
            disabled={assessing}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
          >
            {assessing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Assess with AI
          </button>
        }
      >
        <AiWaitIndicator active={assessing} messages={["Weighing technical approach...", "Scoring feasibility..."]} className="mb-2" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Feasibility score (0-100)">
            <input
              type="number" min={0} max={100}
              value={form.feasibilityScore ?? ""}
              onChange={(e) => update("feasibilityScore", e.target.value === "" ? undefined : Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <div className="col-span-2">
            <Field label="Feasibility notes">
              <textarea value={form.feasibilityNotes} onChange={(e) => update("feasibilityNotes", e.target.value)} className={inputCls} rows={2} />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title="Current technology landscape"
        action={
          <button
            onClick={suggestLandscape}
            disabled={suggestingLandscape}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
          >
            {suggestingLandscape ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Assume a typical default
          </button>
        }
      >
        <p className="text-xs text-slate-400 mb-2">
          What&apos;s actually running today — describe it if known, or let AI assume a typical default for this
          kind of problem (clearly a placeholder assumption, not a fact, until you edit it).
        </p>
        <AiWaitIndicator active={suggestingLandscape} messages={["Assuming a typical current state..."]} className="mb-2" />
        <textarea
          value={form.currentTechLandscape}
          onChange={(e) => update("currentTechLandscape", e.target.value)}
          className={inputCls}
          rows={3}
          placeholder="e.g. Legacy on-prem system, manual spreadsheet workarounds, limited API access"
        />
      </Card>

      <div>
        <PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</PrimaryButton>
      </div>

      <Card
        title="Technical Recommendation"
        action={
          <button
            onClick={getTechnicalRecommendation}
            disabled={recommending}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
          >
            {recommending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {p.recommendedTechnology ? "Re-run recommendation" : "Get recommendation"}
          </button>
        }
      >
        <p className="text-xs text-slate-400 mb-2">
          AI proposes a specific technology direction (and a first-pass architecture diagram, refined next in
          the Architecture step), grounded in the problem, solution options, and feasibility notes above.
        </p>
        <AiWaitIndicator
          active={recommending}
          messages={["Reviewing the problem and options...", "Working out a technical approach..."]}
          className="mb-2"
        />
        {recommendError && <p className="text-xs text-rose-600 mb-2">{recommendError}</p>}

        {p.recommendedTechnology ? (
          <div className="rounded-lg border border-accent-200 bg-accent-50/60 p-3 mb-3">
            <p className="text-xs font-semibold text-accent-900 mb-1">{p.recommendedTechnology}</p>
            {p.technicalRecommendationRationale && (
              <p className="text-xs text-accent-800 whitespace-pre-wrap">{p.technicalRecommendationRationale}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 mb-3">No technical recommendation yet.</p>
        )}

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={13} className="text-slate-500" />
            <p className="text-xs font-semibold text-slate-700">Feasibility Review</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TECH_REVIEW_STYLES[p.technicalReviewStatus ?? "PENDING"]}`}>
              {TECH_REVIEW_LABELS[p.technicalReviewStatus ?? "PENDING"]}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
            <Field label="Review status">
              <select
                value={reviewForm.technicalReviewStatus}
                onChange={(e) => setReviewForm((f) => ({ ...f, technicalReviewStatus: e.target.value }))}
                className={inputCls}
              >
                <option value="">Not yet reviewed</option>
                <option value="PENDING">Pending Review</option>
                <option value="APPROVED">Approved — confirm feasibility</option>
                <option value="CHANGES_REQUESTED">Changes Requested</option>
              </select>
            </Field>
            <Field label="Reviewed by">
              <input
                value={reviewForm.technicalReviewedBy}
                onChange={(e) => setReviewForm((f) => ({ ...f, technicalReviewedBy: e.target.value }))}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Review notes">
            <textarea
              value={reviewForm.technicalReviewNotes}
              onChange={(e) => setReviewForm((f) => ({ ...f, technicalReviewNotes: e.target.value }))}
              className={inputCls}
              rows={2}
            />
          </Field>
          <button
            onClick={saveReview}
            disabled={savingReview}
            className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 font-medium disabled:opacity-50"
          >
            {savingReview ? "Saving..." : "Save review"}
          </button>
          {p.technicalReviewedAt && (
            <p className="text-xs text-slate-400 mt-1.5">Last reviewed {formatDateTime(p.technicalReviewedAt)}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
