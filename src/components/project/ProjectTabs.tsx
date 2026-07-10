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
  "C-Level Report",
] as const;

export default function ProjectTabs({
  detail,
  allResources,
}: {
  detail: ProjectDetail;
  allResources: Resource[];
}) {
  const searchParams = useSearchParams();
  const autoPlan = searchParams.get("autoplan") === "1";
  const [active, setActive] = useState<(typeof TABS)[number]>(autoPlan ? "Tasks" : "Inception & Ideation");

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-thin">
        {TABS.map((tab) => (
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

      {active === "Inception & Ideation" && <OverviewTab detail={detail} />}
      {active === "Charter" && <CharterTab detail={detail} />}
      {active === "Tasks" && <TasksTab detail={detail} allResources={allResources} autoPlan={autoPlan} />}
      {active === "Resources" && <ResourcesTab detail={detail} allResources={allResources} />}
      {active === "Status Tracking" && <StatusTab detail={detail} />}
      {active === "Communications" && <CommsTab detail={detail} />}
      {active === "Risks" && <RisksTab detail={detail} />}
      {active === "Milestones" && <MilestonesTab detail={detail} />}
      {active === "Invoices" && <InvoicesTab detail={detail} />}
      {active === "C-Level Report" && <ReportTab detail={detail} />}
    </div>
  );
}
