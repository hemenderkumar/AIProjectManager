"use client";
import { useState } from "react";
import IncidentsBoard from "./IncidentsBoard";
import SupportEstimator from "./SupportEstimator";

type Incident = Parameters<typeof IncidentsBoard>[0]["incidents"];
type ProjectOption = { id: string; name: string };

export default function SupportTabs({
  incidents,
  projects,
  defaultBlendedHourlyRate,
}: {
  incidents: Incident;
  projects: ProjectOption[];
  defaultBlendedHourlyRate?: number;
}) {
  const [tab, setTab] = useState<"incidents" | "estimator">("incidents");

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-5">
        <button
          onClick={() => setTab("incidents")}
          className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "incidents" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Incidents
        </button>
        <button
          onClick={() => setTab("estimator")}
          className={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "estimator" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Cost Estimator
        </button>
      </div>

      {tab === "incidents" ? (
        <IncidentsBoard incidents={incidents} projects={projects} />
      ) : (
        <SupportEstimator projects={projects} defaultBlendedHourlyRate={defaultBlendedHourlyRate} />
      )}
    </div>
  );
}
