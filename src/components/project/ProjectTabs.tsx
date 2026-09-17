"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { getProjectDetail } from "@/lib/portfolio";
import OverviewTab from "./OverviewTab";
import IdeationWorkspace from "./IdeationWorkspace";
import FeasibilityWorkspace from "./FeasibilityWorkspace";
import ArchitectureWorkspace from "./ArchitectureWorkspace";
import BusinessCaseWorkspace from "./BusinessCaseWorkspace";
import CharterTab from "./CharterTab";
import ResourcingDecisionTab from "./ResourcingDecisionTab";
import TasksTab from "./TasksTab";
import ResourcesTab from "./ResourcesTab";
import StatusTab from "./StatusTab";
import CommsTab from "./CommsTab";
import RisksTab from "./RisksTab";
import MilestonesTab from "./MilestonesTab";
import ReportTab from "./ReportTab";
import InvoicesTab from "./InvoicesTab";
import BudgetTab from "./BudgetTab";
import DeliveryTab from "./DeliveryTab";
import SowTab from "./SowTab";
import DeliverablesTab from "./DeliverablesTab";
import QaTab from "./QaTab";
import type { SessionUser } from "@/lib/auth";
import type { RateCardEntry } from "@/lib/deliveryModel";
import { Compass, Rocket, Receipt, BarChart3, Lock, CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";
import { SUB_STAGE_ORDER, SUB_STAGE_LABELS, isSubStageUnlocked, subStageIndex, type IdeationSubStage } from "@/lib/ideationGates";

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

type Resource = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  capacityHoursPerWk: number | null;
  costPerHour: number | null;
};

const TABS = [
  "Idea & Alignment",
  "Technical Feasibility",
  "Architecture",
  "Financial Forecast & Projections",
  "Scope & Charter",
  "Resourcing Decision",
  "Tasks",
  "Resources",
  "Status Tracking",
  "Communications",
  "Risks",
  "Milestones",
  "Invoices",
  "Budget",
  "Delivery & Pricing",
  "SOW",
  "Deliverables",
  "Ask AI",
  "C-Level Report",
] as const;

// Reverse lookup from a stage tab's label (as it appears in TABS) back to its ideationSubStage
// key, so the tab bar can apply the same lock/unlock/done gating that used to live inside
// PlanTab.tsx's own inner tab bar. SUB_STAGE_LABELS is the source of truth for the label text —
// these six are spelled out again here only because TABS needs literal string types, not a
// computed union, to keep `(typeof TABS)[number]` narrowing working everywhere below.
const STAGE_LABEL_TO_KEY: Partial<Record<(typeof TABS)[number], IdeationSubStage>> = {
  "Idea & Alignment": "IDEA_ALIGNMENT",
  "Technical Feasibility": "TECHNICAL_FEASIBILITY",
  "Architecture": "ARCHITECTURE_REVIEW",
  "Financial Forecast & Projections": "BUSINESS_CASE",
  "Scope & Charter": "CHARTER",
  "Resourcing Decision": "RESOURCING_DECISION",
};

// Previously "Plan" held one flat tab (itself hiding 5 more sub-tabs one level down, plus the
// always-shown OverviewTab above them) + "Milestones" — opening any idea meant one long scroll
// through all of that stacked on a single screen. Flattened here: the 6 gated stages are now
// direct top-level tabs under "Project Initiation", so switching between them is a tab click,
// not a scroll, and each one only renders its own content (see the OverviewTab placement below).
const TAB_GROUPS: { label: string; icon: React.ReactNode; tabs: (typeof TABS)[number][] }[] = [
  {
    label: "Project Initiation",
    icon: <Compass size={14} />,
    tabs: ["Idea & Alignment", "Technical Feasibility", "Architecture", "Financial Forecast & Projections", "Scope & Charter", "Resourcing Decision", "Milestones"],
  },
  { label: "Execute", icon: <Rocket size={14} />, tabs: ["Tasks", "Resources", "Status Tracking", "Risks", "Communications"] },
  { label: "Commercial", icon: <Receipt size={14} />, tabs: ["SOW", "Deliverables", "Delivery & Pricing", "Invoices", "Budget"] },
  { label: "Insights", icon: <BarChart3 size={14} />, tabs: ["Ask AI", "C-Level Report"] },
];

function groupFor(tab: (typeof TABS)[number]) {
  return TAB_GROUPS.find((g) => g.tabs.includes(tab)) ?? TAB_GROUPS[0];
}

function resolveInitialTab(tabParam: string | null, autoPlan: boolean, ideationSubStage: IdeationSubStage): (typeof TABS)[number] {
  if (autoPlan) return "Tasks";
  const match = TABS.find((t) => t.toLowerCase() === tabParam?.toLowerCase());
  if (match) return match;
  // Land on whichever stage the project is actually at, not always the first one — e.g. a
  // project already at Charter opens on "Scope & Charter", not back at "Idea & Alignment".
  const defaultStage: IdeationSubStage = ideationSubStage === "READY_FOR_EXECUTION" ? "RESOURCING_DECISION" : ideationSubStage;
  return SUB_STAGE_LABELS[defaultStage] as (typeof TABS)[number];
}

// Client-bundle-safe copy of the role check — importing from @/lib/auth would pull in
// next/headers and break the build if a value (non-type) import from it ends up in a
// "use client" component's bundle. Moved here from the old PlanTab.tsx.
function roleAtLeast(role: SessionUser["role"] | undefined, min: SessionUser["role"]) {
  const order = { VIEWER: 0, CONTRIBUTOR: 1, PM: 2, SUPER_USER: 3, ADMIN: 4 };
  return role !== undefined && order[role] >= order[min];
}

export default function ProjectTabs({
  detail,
  allResources,
  user,
  rateCards,
}: {
  detail: ProjectDetail;
  allResources: Resource[];
  user?: SessionUser | null;
  rateCards: RateCardEntry[];
}) {
  const searchParams = useSearchParams();
  const autoPlan = searchParams.get("autoplan") === "1";
  const p = detail.project;
  const [active, setActive] = useState<(typeof TABS)[number]>(() =>
    resolveInitialTab(searchParams.get("tab"), autoPlan, p.ideationSubStage)
  );

  const activeGroup = groupFor(active);
  const activeStageKey = STAGE_LABEL_TO_KEY[active];

  return (
    <div>
      <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-thin">
        {TAB_GROUPS.map((group) => (
          <button
            key={group.label}
            onClick={() => setActive(group.tabs[0])}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              group.label === activeGroup.label
                ? "bg-accent-50 text-accent-700"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {group.icon}
            {group.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-thin">
        {activeGroup.tabs.map((tab) => {
          const stageKey = STAGE_LABEL_TO_KEY[tab];
          const unlocked = !stageKey || isSubStageUnlocked(p.ideationSubStage, stageKey);
          const done = !!stageKey && subStageIndex(p.ideationSubStage) > subStageIndex(stageKey);
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
              {tab}
            </button>
          );
        })}
      </div>

      {/* Project metadata/housekeeping (name, sponsor, integrations, danger zone, ...) only on
          the entry-point tab now, instead of repeated above all 6 stages — that repetition was
          the biggest contributor to "every idea is a big scrolling window". */}
      {active === "Idea & Alignment" && <OverviewTab detail={detail} user={user ?? null} />}

      {activeStageKey && roleAtLeast(user?.role, "SUPER_USER") && p.ideationSubStage !== "READY_FOR_EXECUTION" && (
        <OverrideGateControl projectId={p.id} currentSubStage={p.ideationSubStage} />
      )}

      {active === "Idea & Alignment" && <IdeationWorkspace detail={detail} user={user ?? null} />}
      {active === "Technical Feasibility" && <FeasibilityWorkspace detail={detail} />}
      {active === "Architecture" && <ArchitectureWorkspace detail={detail} />}
      {active === "Financial Forecast & Projections" && <BusinessCaseWorkspace detail={detail} />}
      {active === "Scope & Charter" && <CharterTab detail={detail} />}
      {active === "Resourcing Decision" && (
        <ResourcingDecisionTab detail={detail} onNavigate={(tab) => setActive(tab)} />
      )}
      {active === "Tasks" && <TasksTab detail={detail} allResources={allResources} autoPlan={autoPlan} />}
      {active === "Resources" && (
        <ResourcesTab detail={detail} allResources={allResources} isInternal={!!user && user.organizationId == null} />
      )}
      {active === "Status Tracking" && <StatusTab detail={detail} />}
      {active === "Communications" && <CommsTab detail={detail} />}
      {active === "Risks" && <RisksTab detail={detail} />}
      {active === "Milestones" && <MilestonesTab detail={detail} />}
      {active === "Invoices" && <InvoicesTab detail={detail} />}
      {active === "Budget" && <BudgetTab detail={detail} user={user} />}
      {active === "Delivery & Pricing" && <DeliveryTab detail={detail} rateCards={rateCards} />}
      {active === "SOW" && <SowTab detail={detail} user={user} />}
      {active === "Deliverables" && <DeliverablesTab detail={detail} user={user} />}
      {active === "Ask AI" && <QaTab detail={detail} />}
      {active === "C-Level Report" && <ReportTab detail={detail} />}
    </div>
  );
}

// Company-owner/admin escape hatch: force the project past its current gate without waiting for
// pending reviewer approvals or sign-offs. Every use is audit-logged (see
// api/projects/[id]/override-advance) — this is deliberately a two-step reveal, not a single
// click, since it bypasses a control rather than just editing a field. Moved here from the old
// PlanTab.tsx.
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
