"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Gauge, FolderKanban, Layers, CalendarClock, Plus, Minus } from "lucide-react";
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

type ProjectSkillWeekBucket = { weekStart: string; weekLabel: string; demandHours: number; gapHours: number; requiredHeadcount: number };
type ProjectMonthSkillBucket = {
  skill: string;
  resolvedRole: string | null;
  gapRateSource: "mapped" | "inferred" | "skill";
  gapRate: number;
  demandHours: number;
  gapHours: number;
  requiredHeadcount: number;
  weeks: ProjectSkillWeekBucket[];
};
type ProjectMonthBucket = { monthStart: string; monthLabel: string; demandHours: number; gapHours: number; skills: ProjectMonthSkillBucket[] };
type ProjectTimePhasedForecast = {
  projectId: string;
  projectName: string;
  totalDemandHours: number;
  totalGapHours: number;
  months: ProjectMonthBucket[];
};

type SkillCapacityForecast = {
  skills: SkillGap[];
  byProject: ProjectSkillForecast[];
  byProjectTimePhased: ProjectTimePhasedForecast[];
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

// Self-contained, same "own its own fetch" pattern as RateCardSection — sits on the internal
// Resources page (see requireInternal on /api/forecast/skills) below the roster + rate cards,
// since it draws on both: which required skills across active projects' unstaffed tasks have
// nobody (or not enough spare capacity) on the roster to cover them, and what closing that gap
// is projected to cost.
//
// Three views on the same underlying skill-gap data (see lib/forecast.ts):
//  - By Project (default): a "+"/"-" drill-down, Project -> Month -> Skill -> Week, backed by
//    computeProjectSkillTimePhasedForecast (byProjectTimePhased). Each level only opens one
//    child at a time (expandedProject/expandedMonth/expandedSkill), which keeps a busy roster
//    from turning into a wall of open tables. Week-level gap/headcount numbers are prorated
//    from the skill's overall gap ratio, same proportional-attribution assumption as the rest
//    of this file -- see the comment on computeProjectSkillTimePhasedForecast for why.
//  - By Skill: the original flat view, useful for "how bad is React specifically"
//  - Required Headcount: a weekly/monthly projection of how many people, by skill, the current
//    gap implies -- so hiring/sourcing has a "when" attached, not just a "how much"
export default function SkillCapacityForecast() {
  const [data, setData] = useState<SkillCapacityForecast | null>(null);
  const [view, setView] = useState<"project" | "skill">("project");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [expandedFlatSkill, setExpandedFlatSkill] = useState<string | null>(null);
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
          {(data.byProjectTimePhased ?? []).map((p) => {
            const projectOpen = expandedProject === p.projectId;
            return (
              <div key={p.projectId} className="py-2">
                <button
                  onClick={() => {
                    setExpandedProject(projectOpen ? null : p.projectId);
                    setExpandedMonth(null);
                    setExpandedSkill(null);
                  }}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {projectOpen ? <Minus size={13} className="text-accent-600 shrink-0" /> : <Plus size={13} className="text-accent-600 shrink-0" />}
                    {p.totalGapHours > 0 && <AlertTriangle size={13} className="text-rose-500 shrink-0" />}
                    <span className="text-sm font-medium text-slate-800 truncate">{p.projectName}</span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {p.months.length} month{p.months.length === 1 ? "" : "s"} of demand
                    </span>
                  </div>
                  <span className={`text-xs font-medium shrink-0 ${p.totalGapHours > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {p.totalGapHours > 0 ? `~${Math.round(p.totalGapHours)}h gap` : "covered"}
                  </span>
                </button>
                {projectOpen && (
                  <div className="mt-2 pl-5 space-y-1.5 border-l border-slate-100">
                    {p.months.map((m) => {
                      const monthKey = `${p.projectId}:${m.monthStart}`;
                      const monthOpen = expandedMonth === monthKey;
                      return (
                        <div key={monthKey} className="pl-2">
                          <button
                            onClick={() => {
                              setExpandedMonth(monthOpen ? null : monthKey);
                              setExpandedSkill(null);
                            }}
                            className="w-full flex items-center justify-between gap-3 text-left py-1"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {monthOpen ? <Minus size={12} className="text-slate-500 shrink-0" /> : <Plus size={12} className="text-slate-500 shrink-0" />}
                              <span className="text-xs font-semibold text-slate-700">{m.monthLabel}</span>
                              <span className="text-xs text-slate-400">
                                {m.skills.length} skill{m.skills.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <span className={`text-xs font-medium shrink-0 ${m.gapHours > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                              {m.gapHours > 0 ? `~${Math.round(m.gapHours)}h gap` : "covered"}
                            </span>
                          </button>
                          {monthOpen && (
                            <div className="pl-5 space-y-1 border-l border-slate-100">
                              {m.skills.map((s) => {
                                const skillKey = `${monthKey}:${s.skill}`;
                                const skillOpen = expandedSkill === skillKey;
                                return (
                                  <div key={skillKey} className="py-1">
                                    <button
                                      onClick={() => setExpandedSkill(skillOpen ? null : skillKey)}
                                      className="w-full flex items-center justify-between gap-3 text-left"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        {skillOpen ? <Minus size={11} className="text-slate-400 shrink-0" /> : <Plus size={11} className="text-slate-400 shrink-0" />}
                                        <span className="text-xs font-medium text-slate-700 capitalize truncate">{s.skill}</span>
                                        <span className="text-xs text-slate-400 shrink-0">{Math.round(s.demandHours)}h demand</span>
                                      </div>
                                      <span className={`text-xs font-medium shrink-0 ${s.gapHours > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                                        {s.gapHours > 0 ? `${Math.round(s.gapHours)}h gap · ~${s.requiredHeadcount} FTE` : "covered"}
                                      </span>
                                    </button>
                                    {skillOpen && (
                                      <div className="mt-1.5 pl-5 space-y-1">
                                        {s.gapHours > 0 && (
                                          <p className="text-xs text-slate-400">
                                            <GapRateNote resolvedRole={s.resolvedRole} gapRateSource={s.gapRateSource} gapRate={s.gapRate} />
                                          </p>
                                        )}
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="text-slate-400 text-left">
                                              <th className="font-medium pb-1">Week</th>
                                              <th className="font-medium pb-1 text-right">Demand</th>
                                              <th className="font-medium pb-1 text-right">Gap</th>
                                              <th className="font-medium pb-1 text-right">FTE Needed</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {s.weeks.map((w) => (
                                              <tr key={w.weekStart} className="border-t border-slate-50">
                                                <td className="py-1 text-slate-700 whitespace-nowrap">{w.weekLabel}</td>
                                                <td className="py-1 text-right text-slate-500">{Math.round(w.demandHours)}h</td>
                                                <td className={`py-1 text-right ${w.gapHours > 0 ? "text-amber-600" : "text-slate-300"}`}>
                                                  {w.gapHours > 0 ? `${Math.round(w.gapHours)}h` : "—"}
                                                </td>
                                                <td className={`py-1 text-right ${w.requiredHeadcount > 0 ? "text-amber-600 font-medium" : "text-slate-300"}`}>
                                                  {w.requiredHeadcount > 0 ? w.requiredHeadcount : "—"}
                                                </td>
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
                        </div>
                      );
                    })}
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
            const open = expandedFlatSkill === g.skill;
            const hasGap = g.gapHours > 0;
            return (
              <div key={g.skill} className="py-2">
                <button onClick={() => setExpandedFlatSkill(open ? null : g.skill)} className="w-full flex items-center justify-between gap-3 text-left">
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
