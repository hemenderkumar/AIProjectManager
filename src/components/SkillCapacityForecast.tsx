"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Gauge, FolderKanban, Layers, CalendarClock } from "lucide-react";
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

type ProjectSkillDetail = {
  skill: string;
  demandHours: number;
  gapHours: number;
  matchedResourceCount: number;
  resolvedRole: string | null;
  gapRateSource: "mapped" | "inferred" | "skill";
  gapRate: number;
  tasks: SkillGapTaskRef[];
};

type ProjectSkillForecast = {
  projectId: string;
  projectName: string;
  totalDemandHours: number;
  totalGapHours: number;
  skills: ProjectSkillDetail[];
};

type HeadcountBucket = { periodStart: string; periodLabel: string; demandHours: number; gapHours: number; requiredHeadcount: number };
type SkillHeadcount = { skill: string; weekly: HeadcountBucket[]; monthly: HeadcountBucket[] };

type SkillCapacityForecast = {
  skills: SkillGap[];
  byProject: ProjectSkillForecast[];
  headcount: SkillHeadcount[];
  totalDemandHours: number;
  totalGapHours: number;
  totalProjectedCost: number;
  skillsWithNoCoverage: number;
  assumptions: { horizonWeeks: number; sourcingTypeForGapRate: string };
};

function GapRateNote({ resolvedRole, gapRateSource, gapRate }: { resolvedRole: string | null; gapRateSource: SkillGap["gapRateSource"]; gapRate: number }) {
  return (
    <>
      gap priced at ${gapRate.toFixed(0)}/hr
      {resolvedRole
        ? ` as ${resolvedRole} (${gapRateSource === "mapped" ? "mapped" : "inferred from roster"})`
        : " using the skill name itself — add a Skill → Role mapping below for an accurate rate"}
    </>
  );
}

function TaskTable({ tasks }: { tasks: SkillGapTaskRef[]; showProject?: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-slate-400 text-left">
          <th className="font-medium pb-1">Task</th>
          <th className="font-medium pb-1 text-right">Hours</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id} className="border-t border-slate-50">
            <td className="py-1 text-slate-700 truncate max-w-[260px]">{t.title}</td>
            <td className="py-1 text-right text-slate-500">{t.hours}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Self-contained, same "own its own fetch" pattern as RateCardSection — sits on the internal
// Resources page (see requireInternal on /api/forecast/skills) below the roster + rate cards,
// since it draws on both: which required skills across active projects' unstaffed tasks have
// nobody (or not enough spare capacity) on the roster to cover them, and what closing that gap
// is projected to cost.
//
// Three views on the same underlying skill-gap data (see lib/forecast.ts):
//  - By Project (default): which projects are driving the shortage, skills nested inside each
//  - By Skill: the original flat view, useful for "how bad is React specifically"
//  - Required Headcount: a weekly/monthly projection of how many people, by skill, the current
//    gap implies -- so hiring/sourcing has a "when" attached, not just a "how much"
export default function SkillCapacityForecast() {
  const [data, setData] = useState<SkillCapacityForecast | null>(null);
  const [view, setView] = useState<"project" | "skill">("project");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [headcountGranularity, setHeadcountGranularity] = useState<"weekly" | "monthly">("weekly");

  useEffect(() => {
    fetch("/api/forecast/skills")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.skills.length === 0) return null;

  // Union of period columns across every skill's buckets (they don't all share the same
  // periods, since each skill's demand lands on different task due dates) -- capped so the
  // table stays readable even with a long horizon.
  const periodCap = headcountGranularity === "weekly" ? 8 : 6;
  const periodMap = new Map<string, string>(); // periodStart -> periodLabel
  for (const h of data.headcount) {
    for (const b of h[headcountGranularity]) periodMap.set(b.periodStart, b.periodLabel);
  }
  const periods = [...periodMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, periodCap);

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

      <div className="flex items-center gap-1 border-b border-slate-100 pb-2">
        <button
          onClick={() => setView("project")}
          className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${view === "project" ? "bg-accent-50 text-accent-700" : "text-slate-500 hover:text-slate-700"}`}
        >
          <FolderKanban size={12} /> By Project
        </button>
        <button
          onClick={() => setView("skill")}
          className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${view === "skill" ? "bg-accent-50 text-accent-700" : "text-slate-500 hover:text-slate-700"}`}
        >
          <Layers size={12} /> By Skill
        </button>
      </div>

      {view === "project" && (
        <div className="divide-y divide-slate-100">
          {data.byProject.map((p) => {
            const open = expandedProject === p.projectId;
            return (
              <div key={p.projectId} className="py-2">
                <button onClick={() => setExpandedProject(open ? null : p.projectId)} className="w-full flex items-center justify-between gap-3 text-left">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.totalGapHours > 0 && <AlertTriangle size={13} className="text-rose-500 shrink-0" />}
                    <span className="text-sm font-medium text-slate-800 truncate">{p.projectName}</span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {p.skills.length} skill{p.skills.length === 1 ? "" : "s"} needed
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`text-xs font-medium ${p.totalGapHours > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {p.totalGapHours > 0 ? `~${Math.round(p.totalGapHours)}h gap` : "covered"}
                    </span>
                    {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                  </div>
                </button>
                {open && (
                  <div className="mt-2 pl-5 space-y-3">
                    {p.skills.map((s) => (
                      <div key={s.skill} className="space-y-1">
                        <p className="text-xs font-medium text-slate-700 capitalize">
                          {s.skill}{" "}
                          <span className="font-normal text-slate-400">
                            — {Math.round(s.demandHours)}h demanded
                            {s.gapHours > 0 && (
                              <>
                                {" "}
                                · ~{Math.round(s.gapHours)}h of this project&apos;s share estimated short (prorated from the skill&apos;s overall gap)
                              </>
                            )}
                          </span>
                        </p>
                        {s.gapHours > 0 && (
                          <p className="text-xs text-slate-400">
                            <GapRateNote resolvedRole={s.resolvedRole} gapRateSource={s.gapRateSource} gapRate={s.gapRate} />
                          </p>
                        )}
                        <TaskTable tasks={s.tasks} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {view === "skill" && (
        <div className="divide-y divide-slate-100">
          {data.skills.map((g) => {
            const open = expandedSkill === g.skill;
            const hasGap = g.gapHours > 0;
            return (
              <div key={g.skill} className="py-2">
                <button onClick={() => setExpandedSkill(open ? null : g.skill)} className="w-full flex items-center justify-between gap-3 text-left">
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
                          · <GapRateNote resolvedRole={g.resolvedRole} gapRateSource={g.gapRateSource} gapRate={g.gapRate} />
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
      )}

      {data.headcount.length > 0 && (
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarClock size={14} className="text-accent-600" />
            <p className="text-xs font-semibold text-slate-900">Required Headcount Forecast</p>
            <span className="text-xs text-slate-400">— people needed, by skill, based on unstaffed tasks&apos; due dates</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setHeadcountGranularity("weekly")}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${headcountGranularity === "weekly" ? "bg-accent-50 text-accent-700" : "text-slate-400 hover:text-slate-600"}`}
              >
                Weekly
              </button>
              <button
                onClick={() => setHeadcountGranularity("monthly")}
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${headcountGranularity === "monthly" ? "bg-accent-50 text-accent-700" : "text-slate-400 hover:text-slate-600"}`}
              >
                Monthly
              </button>
            </div>
          </div>
          {periods.length === 0 ? (
            <p className="text-xs text-slate-400">No dated unstaffed work in the current horizon to project against.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-slate-400 text-left">
                    <th className="font-medium pb-1 pr-3">Skill</th>
                    {periods.map(([start, label]) => (
                      <th key={start} className="font-medium pb-1 px-2 text-right whitespace-nowrap">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.headcount.map((h) => {
                    const byPeriod = new Map(h[headcountGranularity].map((b) => [b.periodStart, b.requiredHeadcount]));
                    return (
                      <tr key={h.skill} className="border-t border-slate-50">
                        <td className="py-1 pr-3 text-slate-700 capitalize whitespace-nowrap">{h.skill}</td>
                        {periods.map(([start]) => {
                          const v = byPeriod.get(start) ?? 0;
                          return (
                            <td key={start} className={`py-1 px-2 text-right ${v > 0 ? "text-amber-600 font-medium" : "text-slate-300"}`}>
                              {v > 0 ? v : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
