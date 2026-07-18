"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { getProjectDetail } from "@/lib/portfolio";
import OverviewTab from "./OverviewTab";
import CharterTab from "./CharterTab";
import TasksTab from "./TasksTab";
import ResourcesTab from "./ResourcesTab";
import StatusTab from "./StatusTab";
import CommsTab from "./CommsTab";
import RisksTab from "./RisksTab";
import MilestonesTab from "./MilestonesTab";
import ReportTab from "./ReportTab";
import InvoicesTab from "./InvoicesTab";
import DeliveryTab from "./DeliveryTab";
import SowTab from "./SowTab";
import DeliverablesTab from "./DeliverablesTab";
import QaTab from "./QaTab";
import type { SessionUser } from "@/lib/auth";
import type { RateCardEntry } from "@/lib/deliveryModel";
import { Compass, Rocket, Receipt, BarChart3 } from "lucide-react";

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
  "Inception & Ideation",
  "Charter",
  "Tasks",
  "Resources",
  "Status Tracking",
  "Communications",
  "Risks",
  "Milestones",
  "Invoices",
  "Delivery & Pricing",
  "SOW",
  "Deliverables",
  "Ask AI",
  "C-Level Report",
] as const;

// 14 flat tabs in one row was overwhelming and hid how many were off-screen on a scroll.
// Grouped by where they sit in an engagement's lifecycle, mirroring the sidebar's own
// "Project Lifecycle" / "More" grouping so the mental model is consistent app-wide.
const TAB_GROUPS: { label: string; icon: React.ReactNode; tabs: (typeof TABS)[number][] }[] = [
  { label: "Plan", icon: <Compass size={14} />, tabs: ["Inception & Ideation", "Charter", "Milestones"] },
  { label: "Execute", icon: <Rocket size={14} />, tabs: ["Tasks", "Resources", "Status Tracking", "Risks", "Communications"] },
  { label: "Commercial", icon: <Receipt size={14} />, tabs: ["SOW", "Deliverables", "Delivery & Pricing", "Invoices"] },
  { label: "Insights", icon: <BarChart3 size={14} />, tabs: ["Ask AI", "C-Level Report"] },
];

function groupFor(tab: (typeof TABS)[number]) {
  return TAB_GROUPS.find((g) => g.tabs.includes(tab)) ?? TAB_GROUPS[0];
}

function resolveInitialTab(tabParam: string | null, autoPlan: boolean): (typeof TABS)[number] {
  if (autoPlan) return "Tasks";
  const match = TABS.find((t) => t.toLowerCase() === tabParam?.toLowerCase());
  return match ?? "Inception & Ideation";
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
  const [active, setActive] = useState<(typeof TABS)[number]>(() =>
    resolveInitialTab(searchParams.get("tab"), autoPlan)
  );

  const activeGroup = groupFor(active);

  return (
    <div>
      <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-thin">
        {TAB_GROUPS.map((group) => (
          <button
            key={group.label}
            onClick={() => setActive(group.tabs[0])}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              group.label === activeGroup.label
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            {group.icon}
            {group.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-thin">
        {activeGroup.tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active === tab
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === "Inception & Ideation" && (
        <OverviewTab
          detail={detail}
          user={user ?? null}
          onNavigate={(tab) => setActive(tab)}
        />
      )}
      {active === "Charter" && <CharterTab detail={detail} />}
      {active === "Tasks" && <TasksTab detail={detail} allResources={allResources} autoPlan={autoPlan} />}
      {active === "Resources" && (
        <ResourcesTab detail={detail} allResources={allResources} isInternal={!!user && user.organizationId == null} />
      )}
      {active === "Status Tracking" && <StatusTab detail={detail} />}
      {active === "Communications" && <CommsTab detail={detail} />}
      {active === "Risks" && <RisksTab detail={detail} />}
      {active === "Milestones" && <MilestonesTab detail={detail} />}
      {active === "Invoices" && <InvoicesTab detail={detail} />}
      {active === "Delivery & Pricing" && <DeliveryTab detail={detail} rateCards={rateCards} />}
      {active === "SOW" && <SowTab detail={detail} user={user} />}
      {active === "Deliverables" && <DeliverablesTab detail={detail} user={user} />}
      {active === "Ask AI" && <QaTab detail={detail} />}
      {active === "C-Level Report" && <ReportTab detail={detail} />}
    </div>
  );
}
