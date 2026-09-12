"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import KpiCard from "@/components/KpiCard";

type ProjectEAC = {
  projectId: string;
  projectName: string;
  totalEstimateHours: number;
  totalActualHours: number;
  physicalPercentComplete: number | null;
  laborCostToDate: number;
  invoiceCostToDate: number;
  actualCostToDate: number;
  budgetPlanned: number;
  eac: number | null;
  vac: number | null;
  insufficientData: boolean;
  scheduleTargetEndDate: string | null;
  projectedEndDate: string | null;
  scheduleSlipDays: number | null;
};

type PortfolioEAC = {
  projects: ProjectEAC[];
  totalBudgetPlanned: number;
  totalActualCostToDate: number;
  totalProjectedCost: number;
  projectsAtRisk: number;
  projectsWithInsufficientData: number;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Self-fetching client component, same pattern as SkillCapacityForecast/RateCardSection — sits
// on the Execution page below the "In Execution" table, which already shows each project's
// budgetActual/budgetPlanned. This panel is a more careful version of the same story: rather
// than the manually-typed budgetActual/percentComplete fields, it derives actual cost and
// physical % complete from logged task hours (+ non-pending invoices) and projects a cost and
// schedule Estimate-At-Completion from there. See lib/forecast.ts's Feature 3 comment for why.
export default function EACForecast() {
  const [data, setData] = useState<PortfolioEAC | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/forecast/eac")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.projects.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Cost &amp; Schedule Forecast (EAC)</p>
        <span className="text-xs text-slate-400">
          — projected from logged hours + invoices, not the manually-entered budget/% complete fields
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Planned Budget" value={`$${Math.round(data.totalBudgetPlanned).toLocaleString()}`} />
        <KpiCard label="Actual Cost to Date" value={`$${Math.round(data.totalActualCostToDate).toLocaleString()}`} />
        <KpiCard
          label="Projected Total Cost"
          value={`$${Math.round(data.totalProjectedCost).toLocaleString()}`}
          tone={data.totalProjectedCost > data.totalBudgetPlanned && data.totalBudgetPlanned > 0 ? "warn" : "default"}
        />
        <KpiCard label="Projects At Risk" value={data.projectsAtRisk} tone={data.projectsAtRisk > 0 ? "bad" : "default"} />
      </div>

      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {data.projects.map((p) => {
          const open = expanded === p.projectId;
          const overBudget = p.vac !== null && p.vac < 0;
          const late = p.scheduleSlipDays !== null && p.scheduleSlipDays > 0;
          return (
            <div key={p.projectId} className="py-2">
              <button onClick={() => setExpanded(open ? null : p.projectId)} className="w-full flex items-center justify-between gap-3 text-left">
                <div className="flex items-center gap-2 min-w-0">
                  {(overBudget || late) && <AlertTriangle size={13} className="text-rose-500 shrink-0" />}
                  <span className="text-sm font-medium text-slate-800 truncate">{p.projectName}</span>
                  {p.insufficientData && <span className="text-xs text-slate-400 shrink-0">not enough logged progress yet</span>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {p.physicalPercentComplete !== null && (
                    <span className="text-xs text-slate-500">{Math.round(p.physicalPercentComplete * 100)}% done (hours-based)</span>
                  )}
                  {p.eac !== null && (
                    <span className={`text-xs font-medium ${overBudget ? "text-rose-600" : "text-emerald-600"}`}>
                      EAC ${Math.round(p.eac).toLocaleString()}
                    </span>
                  )}
                  {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </button>
              {open && (
                <div className="mt-2 pl-5 space-y-1 text-xs text-slate-500">
                  <p>
                    Actual cost to date: ${Math.round(p.actualCostToDate).toLocaleString()} (${Math.round(p.laborCostToDate).toLocaleString()}{" "}
                    labor from logged hours + ${Math.round(p.invoiceCostToDate).toLocaleString()} non-pending invoices), against a planned budget
                    of ${Math.round(p.budgetPlanned).toLocaleString()}.
                  </p>
                  {p.insufficientData ? (
                    <p>Not enough hours logged against estimates yet to project a reliable EAC — check back once more work is logged.</p>
                  ) : (
                    <>
                      <p>
                        At the current burn rate, projected total cost is ${Math.round(p.eac ?? 0).toLocaleString()}
                        {p.vac !== null && (
                          <> ({p.vac < 0 ? "over" : "under"} planned budget by ${Math.round(Math.abs(p.vac)).toLocaleString()})</>
                        )}
                        .
                      </p>
                      <p>
                        Target end date {fmtDate(p.scheduleTargetEndDate)}; projected completion {fmtDate(p.projectedEndDate)}
                        {p.scheduleSlipDays !== null && (
                          <> ({p.scheduleSlipDays > 0 ? `${p.scheduleSlipDays}d late` : `${Math.abs(p.scheduleSlipDays)}d ahead`})</>
                        )}
                        .
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
