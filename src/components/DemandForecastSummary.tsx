"use client";
import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import Link from "next/link";

type DemandForecastItem = { id: string; title: string; hours: number };
type DemandForecast = {
  items: DemandForecastItem[];
  totalHours: number;
  totalCost: number;
  weeksToClear: number;
};

// Self-fetching summary card for the Demand Pipeline Forecast (Feature 1) -- the full
// breakdown (by division, by type, queue order) lives on the Demand page itself; this is a
// compact rollup for the cross-forecast overview page, same "own its own fetch" pattern as
// every other forecast panel in the app.
export default function DemandForecastSummary() {
  const [data, setData] = useState<DemandForecast | null>(null);

  useEffect(() => {
    fetch("/api/forecast/demand")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.items.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Inbox size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Demand Pipeline Forecast</p>
        <Link href="/demand" className="text-xs text-accent-600 hover:underline ml-auto">
          Full breakdown &rarr;
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Pipeline Hours" value={Math.round(data.totalHours).toLocaleString()} />
        <KpiCard label="Rough Projected Cost" value={`$${Math.round(data.totalCost).toLocaleString()}`} />
        <KpiCard label="Weeks to Clear" value={data.weeksToClear} />
        <KpiCard label="Next Up" value={data.items[0]?.title ?? "—"} />
      </div>
    </div>
  );
}
