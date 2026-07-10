"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateInput } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import { Sparkles, Loader2, CheckCircle2, Lock } from "lucide-react";

// Duplicated (not imported) on purpose: "@/lib/auth" pulls in next/headers, which breaks
// the build if a value (non-type) import from it ends up in a "use client" component's
// bundle. This is the same tiny role-order check as roleAtLeast() in lib/auth.ts.
function roleAtLeast(role: SessionUser["role"], min: SessionUser["role"]) {
  const order = { VIEWER: 0, CONTRIBUTOR: 1, PM: 2, ADMIN: 3 };
  return order[role] >= order[min];
}

type BrainstormResult = { angles: string[]; openQuestions: string[]; recommendation: string };
type FeasibilityResult = {
  technicalApproach: string;
  feasibilityScore: number;
  feasibilityRating: string;
  keyRisks: string[];
  openQuestions: string[];
  assumptions: string[];
};

export default function OverviewTab({
  detail,
  user,
  onNavigate,
}: {
  detail: ProjectDetail;
  user: SessionUser | null;
  onNavigate: (tab: "Charter" | "Tasks") => void;
}) {
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
    ideationAlignment: p.ideationAlignment ?? "",
    feasibilityScore: p.feasibilityScore ?? undefined,
    feasibilityNotes: p.feasibilityNotes ?? "",
  });

  const [brainstorming, setBrainstorming] = useState(false);
  const [brainstormError, setBrainstormError] = useState<string | null>(null);
  const [brainstormResult, setBrainstormResult] = useState<BrainstormResult | null>(null);

  const [assessing, setAssessing] = useState(false);
  const [feasibilityError, setFeasibilityError] = useState<string | null>(null);
  const [feasibilityResult, setFeasibilityResult] = useState<FeasibilityResult | null>(null);

  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

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

  async function brainstorm() {
    setBrainstorming(true);
    setBrainstormError(null);
    setBrainstormResult(null);
    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBrainstormError(data.error ?? "Couldn't brainstorm right now.");
        return;
      }
      setBrainstormResult(data);
    } finally {
      setBrainstorming(false);
    }
  }

  async function assessFeasibility() {
    setAssessing(true);
    setFeasibilityError(null);
    setFeasibilityResult(null);
    try {
      const res = await fetch("/api/ai/feasibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeasibilityError(data.error ?? "Couldn't assess feasibility right now.");
        return;
      }
      setFeasibilityResult(data);
      setForm((f) => ({ ...f, feasibilityScore: data.feasibilityScore, feasibilityNotes: data.technicalApproach }));
    } finally {
      setAssessing(false);
    }
  }

  async function approve() {
    setApproving(true);
    setApproveError(null);
    try {
      const res = await fetch(`/api/projects/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "EXECUTION",
          stageApprovedBy: user?.name ?? "Unknown",
          stageApprovedAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        setApproveError("Couldn't approve — try again.");
        return;
      }
      router.refresh();
      onNavigate("Tasks");
    } finally {
      setApproving(false);
    }
  }

  const canApprove = user ? roleAtLeast(user.role, "PM") : false;
  const hasCharter = Boolean(p.businessCase?.trim() || p.objectives?.trim());
  const hasEstimate = (p.budgetPlanned ?? 0) > 0;
  const alreadyApproved = Boolean(p.stageApprovedAt);
  const readyToApprove = p.stage === "CHARTER" || p.stage === "EXECUTION";

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

      <Card
        title="Step 1 — Idea Generation, Brainstorming & Alignment"
        action={
          <button
            onClick={brainstorm}
            disabled={brainstorming}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
          >
            {brainstorming ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Brainstorm with AI
          </button>
        }
      >
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

          {brainstormError && <p className="text-xs text-rose-600">{brainstormError}</p>}
          {brainstormResult && (
            <div className="border border-indigo-200 bg-indigo-50/60 rounded-lg p-3 space-y-2">
              <div>
                <p className="text-xs font-semibold text-indigo-900 mb-1">Angles to discuss</p>
                <ul className="list-disc list-inside text-xs text-indigo-800 space-y-0.5">
                  {brainstormResult.angles.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-900 mb-1">Open questions to align on</p>
                <ul className="list-disc list-inside text-xs text-indigo-800 space-y-0.5">
                  {brainstormResult.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
              <p className="text-xs text-indigo-700 italic">{brainstormResult.recommendation}</p>
            </div>
          )}

          <Field label="Alignment — what the team decided to take forward, and why">
            <textarea
              value={form.ideationAlignment}
              onChange={(e) => update("ideationAlignment", e.target.value)}
              className={inputCls}
              rows={2}
              placeholder="e.g. Aligned on building in-house rather than buying — cost and integration control outweigh speed."
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Step 2 — Technical Evaluation & Feasibility"
        action={
          <button
            onClick={assessFeasibility}
            disabled={assessing}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
          >
            {assessing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Assess Feasibility with AI
          </button>
        }
      >
        {feasibilityError && <p className="text-xs text-rose-600 mb-2">{feasibilityError}</p>}
        {feasibilityResult && (
          <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 mb-3 space-y-2">
            <p className="text-xs text-slate-700">{feasibilityResult.technicalApproach}</p>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Key risks</p>
              <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                {feasibilityResult.keyRisks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Open questions</p>
              <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                {feasibilityResult.openQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Assumptions (limited-info caveats)</p>
              <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                {feasibilityResult.assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          <Field label="Feasibility score (0-100)">
            <input
              type="number"
              min={0}
              max={100}
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

      <Card title="Step 3 — Estimates">
        <p className="text-sm text-slate-500 mb-3">
          {hasEstimate
            ? `Current planned budget: $${(p.budgetPlanned ?? 0).toLocaleString()}. Refine cost, schedule, and staffing estimates in the Tasks tab.`
            : "No cost/schedule estimate yet — run the AI planner in the Tasks tab to generate a realistic, effort-based estimate before moving forward."}
        </p>
        <button
          onClick={() => onNavigate("Tasks")}
          className="text-xs px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium"
        >
          Go to Tasks — Plan with AI
        </button>
      </Card>

      <Card title="Step 4 — Project Charter">
        <p className="text-sm text-slate-500 mb-3">
          {hasCharter
            ? "Charter is drafted. Review and refine it in the Charter tab."
            : "No charter yet — draft it with AI or write it directly in the Charter tab."}
        </p>
        <button
          onClick={() => onNavigate("Charter")}
          className="text-xs px-3 py-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium"
        >
          Go to Charter
        </button>
      </Card>

      <Card title="Step 5 — Approval">
        {alreadyApproved ? (
          <p className="text-sm text-emerald-700 flex items-center gap-1.5">
            <CheckCircle2 size={15} /> Approved by {p.stageApprovedBy} — this project has moved to execution.
          </p>
        ) : !readyToApprove ? (
          <p className="text-sm text-slate-400">
            Complete the charter (Step 4) before this idea is ready to approve for execution.
          </p>
        ) : !canApprove ? (
          <p className="text-sm text-slate-400 flex items-center gap-1.5">
            <Lock size={14} /> Only a PM or Admin can approve this idea to move into execution.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">
              Approving moves this project from Ideation into Project Execution — everything already
              captured (charter, estimate, resources) carries forward as-is.
            </p>
            {approveError && <p className="text-xs text-rose-600">{approveError}</p>}
            <PrimaryButton onClick={approve} disabled={approving} className="flex items-center gap-1.5">
              {approving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {approving ? "Approving..." : "Approve & Move to Execution"}
            </PrimaryButton>
          </div>
        )}
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
