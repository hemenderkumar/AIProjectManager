"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Gauge } from "lucide-react";
import KpiCard from "@/components/KpiCard";

type SkillGapTaskRef = { id: string; projectId: string; projectName: string; title: string; hours: number; dueDate: string | null };

type SkillGap = {
  skill: string;
  demandHours: number;
  matchedResourceCount: number;
  matchedResourceNames: string[];
  availableCapacityHours: number;
  gapHours: number;
  coveredCost: number;
  gapRate: number;
  gapRateSource: "mapped" | "inferred" | "skill";
  resolvedRole: string | null;
  gapCost: number;
  totalCost: number;
  tasks: SkillGapTaskRef[];
};

type SkillCapacityForecast = {
  skills: SkillGap[];
  totalDemandHours: number;
  totalGapHours: number;
  totalProjectedCost: number;
  skillsWithNoCoverage: number;
  assumptions: { horizonWeeks: number; sourcingTypeForGapRate: string };
};

// Self-contained, same "own its own fetch" pattern as RateCardSection — sits on the internal
// Resources page (see requireInternal on /api/forecast/skills) below the roster + rate cards,
// since it draws on both: which required skills across active projects' unstaffed tasks have
// nobody (or not enough spare capacity) on the roster to cover them, and what closing that gap
// is projected to cost.
export default function SkillCapacityForecast() {
  const [data, setData] = useState<SkillCapacityForecast | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/forecast/skills")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.skills.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Gauge size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Skill Capacity Forecast</p>
        <span className="text-xs text-slate-400">
          — unstaffed work on active projects vs. roster capacity, next {data.assumptions.horizonWeeks} weeks
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Skills Short-Staffed" value={data.skills.filter((s) => s.gapHours > 0).length} tone={data.skills.some((s) => s.gapHours > 0) ? "warn" : "default"} />
        <KpiCard label="No Coverage At All" value={data.skillsWithNoCoverage} tone={data.skillsWithNoCoverage > 0 ? "bad" : "default"} />
        <KpiCard label="Total Gap Hours" value={Math.round(data.totalGapHours).toLocaleString()} />
        <KpiCard label="Projected Cost to Close" value={`$${Math.round(data.totalProjectedCost).toLocaleString()}`} hint={`incl. ${Math.round(data.totalDemandHours).toLocaleString()}h of demand`} />
      </div>

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {data.skills.map((g) => {
          const open = expanded === g.skill;
          const hasGap = g.gapHours > 0;
          return (
            <div key={g.skill} className="py-2">
              <button onClick={() => setExpanded(open ? null : g.skill)} className="w-full flex items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  {g.matchedResourceCount === 0 && <AlertTriangle size={13} className="text-rose-500 shrink-0" />}
                  <span className="text-sm font-medium text-slate-800 capitalize truncate">{g.skill}</span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {g.matchedResourceCount === 0 ? "nobody on roster" : `${g.matchedResourceCount} resource${g.matchedResourceCount === 1 ? "" : "s"} matched`}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium ${hasGap ? "text-amber-600" : "text-emerald-600"}`}>
                    {hasGap ? `${Math.round(g.gapHours)}h gap` : "covered"}
                  </span>
                  <span className="text-xs text-slate-500">${Math.round(g.totalCost).toLocaleString()}</span>
                  {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </button>
              {open && (
                <div className="mt-2 pl-5 space-y-2">
                  <p className="text-xs text-slate-500">
                    {Math.round(g.demandHours)}h demanded · {Math.round(g.availableCapacityHours)}h available from{" "}
                    {g.matchedResourceNames.length > 0 ? g.matchedResourceNames.join(", ") : "no one on the roster"}
                    {hasGap && (
                      <>
                        {" "}
                        · gap priced at ${g.gapRate.toFixed(0)}/hr
                        {g.resolvedRole
                          ? ` as ${g.resolvedRole} (${g.gapRateSource === "mapped" ? "mapped" : "inferred from roster"})`
                          : " using the skill name itself — add a Skill → Role mapping below for an accurate rate"}
                      </>
                    )}
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 text-left">
                        <th className="font-medium pb-1">Task</th>
                        <th className="font-medium pb-1">Project</th>
                        <th className="font-medium pb-1 text-right">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.tasks.map((t) => (
                        <tr key={t.id} className="border-t border-slate-50">
                          <td className="py-1 text-slate-700 truncate max-w-[220px]">{t.title}</td>
                          <td className="py-1 text-slate-500 truncate max-w-[160px]">{t.projectName}</td>
                          <td className="py-1 text-right text-slate-500">{t.hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
