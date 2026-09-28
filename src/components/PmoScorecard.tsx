"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Gauge } from "lucide-react";
import KpiCard from "@/components/KpiCard";

type ResourceUtilizationRow = {
  resourceId: string;
  name: string;
  role: string | null;
  capacityHoursPerWk: number | null;
  allocatedPercent: number;
};

type CsatMonthBucket = {
  monthKey: string;
  avgCsat: number | null;
  avgNps: number | null;
  responseCount: number;
};

type PmoScorecard = {
  totalProjects: number;
  activeProjects: number;
  closedProjects: number;
  onTimeRate: number | null;
  onTimeSampleSize: number;
  onBudgetRate: number | null;
  onBudgetSampleSize: number;
  successRate: number | null;
  successSampleSize: number;
  avgBudgetVariancePercent: number | null;
  resourceUtilization: ResourceUtilizationRow[];
  avgResourceUtilizationPercent: number | null;
  overAllocatedCount: number;
  csatTrend: CsatMonthBucket[];
  overallAvgCsat: number | null;
  overallAvgNps: number | null;
  csatResponseCount: number;
  governanceModel: "SUPPORTIVE" | "CONTROLLING" | "DIRECTIVE" | "ENTERPRISE";
};

const GOVERNANCE_LABELS: Record<string, string> = {
  SUPPORTIVE: "Supportive",
  CONTROLLING: "Controlling",
  DIRECTIVE: "Directive",
  ENTERPRISE: "Enterprise",
};

function rateTone(rate: number | null): "default" | "good" | "warn" | "bad" {
  if (rate === null) return "default";
  if (rate >= 80) return "good";
  if (rate >= 50) return "warn";
  return "bad";
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
}

// Portfolio-wide PMO health rollup: delivery success (on-time/on-budget), resource
// utilization, and client satisfaction trend, in one place -- the three questions a PMO lead
// actually gets asked ("are we delivering," "are we overcommitted," "are clients happy"),
// each reusing computation already built for the health engine (#3), forecast rollup (#398),
// and CSAT tracking (#406) rather than a fourth definition of any of them. Self-fetching, same
// hide-when-forbidden pattern as the other portfolio panels.
export default function PmoScorecard() {
  const [data, setData] = useState<PmoScorecard | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [expandedUtilization, setExpandedUtilization] = useState(false);

  useEffect(() => {
    fetch("/api/pmo-scorecard")
      .then((r) => {
        if (r.status === 403) {
          setForbidden(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((d) => d && setData(d))
      .catch(() => {});
  }, []);

  if (forbidden || !data) return null;

  const maxCsatResponses = Math.max(1, ...data.csatTrend.map((b) => b.responseCount));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Gauge size={15} className="text-accent-600" />
          <p className="text-sm font-semibold text-slate-900">PMO Scorecard</p>
          <span className="text-xs text-slate-400">
            — governance model: <span className="font-medium text-slate-600">{GOVERNANCE_LABELS[data.governanceModel]}</span>
          </span>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Delivery success (closed projects)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="Overall Success Rate"
              value={data.successRate !== null ? `${data.successRate}%` : "—"}
              hint={data.successSampleSize ? `${data.successSampleSize} closed project(s) evaluated` : "no closed projects with both dates + budget yet"}
              tone={rateTone(data.successRate)}
            />
            <KpiCard
              label="On-Time Rate"
              value={data.onTimeRate !== null ? `${data.onTimeRate}%` : "—"}
              hint={data.onTimeSampleSize ? `of ${data.onTimeSampleSize} evaluable` : undefined}
              tone={rateTone(data.onTimeRate)}
            />
            <KpiCard
              label="On-Budget Rate"
              value={data.onBudgetRate !== null ? `${data.onBudgetRate}%` : "—"}
              hint={data.onBudgetSampleSize ? `of ${data.onBudgetSampleSize} evaluable` : undefined}
              tone={rateTone(data.onBudgetRate)}
            />
            <KpiCard
              label="Avg. Budget Variance"
              value={data.avgBudgetVariancePercent !== null ? `${data.avgBudgetVariancePercent > 0 ? "+" : ""}${data.avgBudgetVariancePercent}%` : "—"}
              tone={data.avgBudgetVariancePercent === null ? "default" : data.avgBudgetVariancePercent < 10 ? "good" : "warn"}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {data.activeProjects} active, {data.closedProjects} closed, {data.totalProjects} total. &quot;Success&quot; = delivered on or before
            its target end date AND within 10% of planned budget.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Resource utilization</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard
              label="Avg. Utilization"
              value={data.avgResourceUtilizationPercent !== null ? `${data.avgResourceUtilizationPercent}%` : "—"}
              tone={
                data.avgResourceUtilizationPercent === null
                  ? "default"
                  : data.avgResourceUtilizationPercent > 100
                    ? "warn"
                    : data.avgResourceUtilizationPercent >= 70
                      ? "good"
                      : "default"
              }
            />
            <KpiCard
              label="Over-Allocated Resources"
              value={data.overAllocatedCount}
              tone={data.overAllocatedCount > 0 ? "warn" : "good"}
              hint="allocated over 100% across visible projects"
            />
            <KpiCard label="Resources Staffed" value={data.resourceUtilization.length} />
          </div>
          {data.resourceUtilization.length > 0 && (
            <>
              <button
                onClick={() => setExpandedUtilization((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700 mt-2"
              >
                {expandedUtilization ? "Hide" : "Show"} per-resource detail
                {expandedUtilization ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              {expandedUtilization && (
                <table className="w-full text-xs mt-2">
                  <thead>
                    <tr className="text-slate-400 text-left border-b border-slate-100">
                      <th className="font-medium py-1">Resource</th>
                      <th className="font-medium py-1">Role</th>
                      <th className="font-medium py-1 text-right">Allocated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.resourceUtilization.map((r) => (
                      <tr key={r.resourceId} className="border-b border-slate-50 last:border-0">
                        <td className="py-1.5 text-slate-700">{r.name}</td>
                        <td className="py-1.5 text-slate-500">{r.role ?? "—"}</td>
                        <td className={`py-1.5 text-right font-medium ${r.allocatedPercent > 100 ? "text-amber-600" : "text-slate-700"}`}>
                          {r.allocatedPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Client satisfaction trend (last 6 months)</p>
          {data.csatResponseCount === 0 ? (
            <p className="text-xs text-slate-400">No completed satisfaction surveys in this window yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                <KpiCard label="Avg. CSAT (1-5)" value={data.overallAvgCsat ?? "—"} />
                <KpiCard label="Avg. NPS (0-10)" value={data.overallAvgNps ?? "—"} />
                <KpiCard label="Responses" value={data.csatResponseCount} />
              </div>
              <div className="flex items-end gap-2 h-20">
                {data.csatTrend.map((b) => (
                  <div key={b.monthKey} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end h-14 bg-slate-50 rounded">
                      <div
                        className="bg-accent-500/80 rounded-b"
                        style={{ height: `${b.responseCount ? Math.max(6, (b.responseCount / maxCsatResponses) * 100) : 0}%` }}
                        title={`${b.responseCount} response(s)${b.avgCsat !== null ? `, avg CSAT ${b.avgCsat}` : ""}`}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">{monthLabel(b.monthKey)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
