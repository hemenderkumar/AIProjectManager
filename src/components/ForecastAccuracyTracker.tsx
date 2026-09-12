"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Target } from "lucide-react";
import KpiCard from "@/components/KpiCard";

type ForecastAccuracySample = {
  snapshotDate: string;
  eac: number;
  percentCompleteAtSnapshot: number | null;
  errorPercent: number;
};

type ForecastAccuracyProject = {
  projectId: string;
  projectName: string;
  finalActualCost: number;
  snapshotCount: number;
  earliestSample: ForecastAccuracySample | null;
  latestSample: ForecastAccuracySample | null;
};

type ForecastAccuracy = {
  projects: ForecastAccuracyProject[];
  meanAbsoluteErrorPercentEarly: number | null;
  meanAbsoluteErrorPercentLate: number | null;
  evaluatedProjectCount: number;
};

function fmtErr(e: number) {
  const sign = e > 0 ? "+" : "";
  return `${sign}${e.toFixed(0)}%`;
}

// Self-fetching, sits on the Execution page below EACForecast -- this is what tells you
// whether that panel's numbers can be trusted. Only shows once at least one closed project has
// stored EAC snapshots (see /api/forecast/eac's opportunistic capture): since snapshots only
// start accumulating from when this feature ships, there's nothing to show until a project
// that was open after that point closes. That's expected, not a bug -- same "hide when there's
// nothing to report" pattern as the other forecast panels.
export default function ForecastAccuracyTracker() {
  const [data, setData] = useState<ForecastAccuracy | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/forecast/accuracy")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.evaluatedProjectCount === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Target size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Forecast Accuracy</p>
        <span className="text-xs text-slate-400">— how close the EAC forecast above has been on closed projects</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Closed Projects Evaluated" value={data.evaluatedProjectCount} />
        <KpiCard
          label="Avg. Error — Early Forecast"
          value={data.meanAbsoluteErrorPercentEarly !== null ? `${data.meanAbsoluteErrorPercentEarly.toFixed(0)}%` : "—"}
          hint="first snapshot with enough progress to compute an EAC"
        />
        <KpiCard
          label="Avg. Error — Late Forecast"
          value={data.meanAbsoluteErrorPercentLate !== null ? `${data.meanAbsoluteErrorPercentLate.toFixed(0)}%` : "—"}
          hint="last snapshot before the project closed"
          tone={
            data.meanAbsoluteErrorPercentLate !== null &&
            data.meanAbsoluteErrorPercentEarly !== null &&
            data.meanAbsoluteErrorPercentLate < data.meanAbsoluteErrorPercentEarly
              ? "good"
              : "default"
          }
        />
      </div>

      <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700">
        {expanded ? "Hide" : "Show"} per-project detail
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {expanded && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 text-left border-b border-slate-100">
              <th className="font-medium py-1">Project</th>
              <th className="font-medium py-1 text-right">Final Cost</th>
              <th className="font-medium py-1 text-right">Early EAC (error)</th>
              <th className="font-medium py-1 text-right">Late EAC (error)</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => (
              <tr key={p.projectId} className="border-b border-slate-50 last:border-0">
                <td className="py-1.5 text-slate-700 truncate max-w-[200px]">{p.projectName}</td>
                <td className="py-1.5 text-right text-slate-500">${Math.round(p.finalActualCost).toLocaleString()}</td>
                <td className="py-1.5 text-right text-slate-700">
                  {p.earliestSample ? (
                    <>
                      ${Math.round(p.earliestSample.eac).toLocaleString()}{" "}
                      <span className="text-slate-400">({fmtErr(p.earliestSample.errorPercent)})</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-1.5 text-right text-slate-700">
                  {p.latestSample ? (
                    <>
                      ${Math.round(p.latestSample.eac).toLocaleString()}{" "}
                      <span className="text-slate-400">({fmtErr(p.latestSample.errorPercent)})</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
