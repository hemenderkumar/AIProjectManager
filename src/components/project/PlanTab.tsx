"use client";
import { useState } from "react";
import type { ProjectDetail } from "./ProjectTabs";
import type { SessionUser } from "@/lib/auth";
import { Lock, CheckCircle2 } from "lucide-react";
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

        {active === "IDEA_ALIGNMENT" && <IdeationWorkspace detail={detail} user={user} />}
        {active === "TECHNICAL_FEASIBILITY" && <FeasibilityWorkspace detail={detail} />}
        {active === "ARCHITECTURE_REVIEW" && <ArchitectureWorkspace detail={detail} />}
        {active === "CHARTER" && <CharterTab detail={detail} />}
        {active === "RESOURCING_DECISION" && <ResourcingDecisionTab detail={detail} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}
