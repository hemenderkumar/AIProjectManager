"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Scale } from "lucide-react";
import KpiCard from "@/components/KpiCard";

type CapacityVsDemandItem = {
  id: string;
  title: string;
  status: string;
  hours: number;
  cost: number;
  projectedStartWeekAtRealCapacity: number;
};

type OverAllocatedResource = { id: string; name: string; allocationPercent: number };

type CapacityVsDemand = {
  items: CapacityVsDemandItem[];
  totalDemandHours: number;
  totalWeeklyGrossCapacityHours: number;
  realWeeklyFreeCapacityHours: number;
  currentUtilizationPercent: number;
  assumedWeeklyCapacityHours: number;
  weeksToClearAtRealCapacity: number;
  weeksToClearAtAssumedCapacity: number;
  overAllocatedResources: OverAllocatedResource[];
};

// Self-fetching, same pattern as SkillCapacityForecast/EACForecast — sits on the Resources
// page since it names individual resources (over-allocated list), same internal-only
// sensitivity as the roster itself. Combines the Demand page's pipeline forecast with this
// page's own allocation data to answer "can we take on this new demand given who's already
// stretched thin?" instead of leaving that judgment to Feature 1's flat capacity assumption.
export default function CapacityVsDemandForecast() {
  const [data, setData] = useState<CapacityVsDemand | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/forecast/capacity-vs-demand")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.items.length === 0) return null;

  const behindAssumption = data.weeksToClearAtRealCapacity > data.weeksToClearAtAssumedCapacity;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Scale size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Capacity vs. Demand</p>
        <span className="text-xs text-slate-400">— the incoming pipeline, reprojected against the roster&apos;s real free capacity</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Current Utilization"
          value={`${data.currentUtilizationPercent}%`}
          tone={data.currentUtilizationPercent >= 90 ? "bad" : data.currentUtilizationPercent >= 75 ? "warn" : "default"}
        />
        <KpiCard label="Real Free Capacity" value={`${Math.round(data.realWeeklyFreeCapacityHours)}h/wk`} />
        <KpiCard
          label="Weeks to Clear Pipeline"
          value={Number.isFinite(data.weeksToClearAtRealCapacity) ? data.weeksToClearAtRealCapacity : "—"}
          hint={`vs. ${data.weeksToClearAtAssumedCapacity} assuming ${Math.round(data.assumedWeeklyCapacityHours)}h/wk`}
          tone={behindAssumption ? "warn" : "default"}
        />
        <KpiCard
          label="Over-Allocated Staff"
          value={data.overAllocatedResources.length}
          tone={data.overAllocatedResources.length > 0 ? "bad" : "default"}
        />
      </div>

      {data.overAllocatedResources.length > 0 && (
        <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-rose-700 flex items-center gap-1">
            <AlertTriangle size={12} /> Already over 100% allocated across active projects:
          </p>
          <p className="text-xs text-rose-600">
            {data.overAllocatedResources.map((r) => `${r.name} (${r.allocationPercent}%)`).join(", ")}
          </p>
        </div>
      )}

      <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700">
        {expanded ? "Hide" : "Show"} queue at real capacity
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {expanded && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 text-left border-b border-slate-100">
              <th className="font-medium py-1">Item</th>
              <th className="font-medium py-1 text-right">Hours</th>
              <th className="font-medium py-1 text-right">Starts (real capacity)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.slice(0, 10).map((i) => (
              <tr key={i.id} className="border-b border-slate-50 last:border-0">
                <td className="py-1.5 text-slate-700 truncate max-w-[220px]">{i.title}</td>
                <td className="py-1.5 text-right text-slate-500">{i.hours}</td>
                <td className="py-1.5 text-right text-slate-700 font-medium">
                  {Number.isFinite(i.projectedStartWeekAtRealCapacity) ? `wk ${i.projectedStartWeekAtRealCapacity}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
