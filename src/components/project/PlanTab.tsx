"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import type { SessionUser } from "@/lib/auth";
import { Lock, CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";
import { SUB_STAGE_ORDER, SUB_STAGE_LABELS, isSubStageUnlocked, subStageIndex, type IdeationSubStage } from "@/lib/ideationGates";
import OverviewTab from "./OverviewTab";
import IdeationWorkspace from "./IdeationWorkspace";
import FeasibilityWorkspace from "./FeasibilityWorkspace";
import ArchitectureWorkspace from "./ArchitectureWorkspace";
import CharterTab from "./CharterTab";
import ResourcingDecisionTab from "./ResourcingDecisionTab";

// The 5 visitable sub-tabs, in order — READY_FOR_EXECUTION (the 6th ideationSubStage value)
// isn't one of these; it just means all 5 gates are satisfied, so Resourcing Decision is
// shown in its "decided" summary state instead of a locked placeholder.
const PLAN_SUB_TABS = SUB_STAGE_ORDER.filter((s): s is Exclude<IdeationSubStage, "READY_FOR_EXECUTION"> => s !== "READY_FOR_EXECUTION");

// Client-bundle-safe copy of the role check — importing from @/lib/auth would pull in
// next/headers and break this "use client" component.
function roleAtLeast(role: SessionUser["role"] | undefined, min: SessionUser["role"]) {
  const order = { VIEWER: 0, CONTRIBUTOR: 1, PM: 2, SUPER_USER: 3, ADMIN: 4 };
  return role !== undefined && order[role] >= order[min];
}

export default function PlanTab({
  detail,
  user,
  onNavigate,
}: {
  detail: ProjectDetail;
  user: SessionUser | null;
  onNavigate: (tab: "Tasks" | "Resources") => void;
}) {
  const p = detail.project;
  const defaultTab: IdeationSubStage = p.ideationSubStage === "READY_FOR_EXECUTION" ? "RESOURCING_DECISION" : p.ideationSubStage;
  const [active, setActive] = useState<IdeationSubStage>(defaultTab);

  return (
    <div className="space-y-6">
      <OverviewTab detail={detail} user={user} />

      <div>
        <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-thin">
          {PLAN_SUB_TABS.map((tab) => {
            const unlocked = isSubStageUnlocked(p.ideationSubStage, tab);
            const done = subStageIndex(p.ideationSubStage) > subStageIndex(tab);
            return (
              <button
                key={tab}
                onClick={() => unlocked && setActive(tab)}
                disabled={!unlocked}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active === tab
                    ? "border-accent-600 text-accent-600"
                    : unlocked
                      ? "border-transparent text-slate-500 hover:text-slate-800"
                      : "border-transparent text-slate-300 cursor-not-allowed"
                }`}
              >
                {done ? <CheckCircle2 size={13} className="text-emerald-500" /> : !unlocked ? <Lock size={12} /> : null}
                {SUB_STAGE_LABELS[tab]}
              </button>
            );
          })}
        </div>

        {roleAtLeast(user?.role, "SUPER_USER") && p.ideationSubStage !== "READY_FOR_EXECUTION" && (
          <OverrideGateControl projectId={p.id} currentSubStage={p.ideationSubStage} />
        )}

        {active === "IDEA_ALIGNMENT" && <IdeationWorkspace detail={detail} user={user} />}
        {active === "TECHNICAL_FEASIBILITY" && <FeasibilityWorkspace detail={detail} />}
        {active === "ARCHITECTURE_REVIEW" && <ArchitectureWorkspace detail={detail} />}
        {active === "CHARTER" && <CharterTab detail={detail} />}
        {active === "RESOURCING_DECISION" && <ResourcingDecisionTab detail={detail} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}

// Company-owner/admin escape hatch: force the project past its current gate without waiting
// for pending reviewer approvals or sign-offs. Every use is audit-logged (see
// api/projects/[id]/override-advance) — this is deliberately a two-step reveal, not a single
// click, since it bypasses a control rather than just editing a field.
function OverrideGateControl({ projectId, currentSubStage }: { projectId: string; currentSubStage: IdeationSubStage }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextIndex = subStageIndex(currentSubStage) + 1;
  const nextLabel = SUB_STAGE_LABELS[SUB_STAGE_ORDER[nextIndex]];

  async function override() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/override-advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Couldn't override this gate.");
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-2.5">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:text-amber-900"
        >
          <ShieldAlert size={13} /> Override — advance to &quot;{nextLabel}&quot; without waiting for pending approvals
        </button>
      ) : (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-amber-900 mb-1.5">
            <ShieldAlert size={13} /> This skips any pending approvals still open on &quot;{SUB_STAGE_LABELS[currentSubStage]}&quot; and moves straight to &quot;{nextLabel}&quot;. It&apos;s logged to the audit trail.
          </p>
          {error && <p className="text-xs text-rose-600 mb-1.5">{error}</p>}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional, but recommended)"
            className="w-full text-xs px-2.5 py-1.5 rounded-md border border-amber-200 bg-white mb-2"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={override}
              disabled={submitting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 font-medium"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : null}
              {submitting ? "Overriding..." : "Yes, override and advance"}
            </button>
            <button onClick={() => setOpen(false)} disabled={submitting} className="text-xs text-amber-700 hover:text-amber-900">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
