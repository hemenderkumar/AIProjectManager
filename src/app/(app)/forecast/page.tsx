import Topbar from "@/components/Topbar";
import DemandForecastSummary from "@/components/DemandForecastSummary";
import EACForecast from "@/components/EACForecast";
import ForecastAccuracyTracker from "@/components/ForecastAccuracyTracker";
import SkillCapacityForecast from "@/components/SkillCapacityForecast";
import CapacityVsDemandForecast from "@/components/CapacityVsDemandForecast";

export const dynamic = "force-dynamic";

// Rolls up every forecast panel built across Features 1-3 (plus the combined capacity-vs-
// demand view and the accuracy tracker) into one page, instead of leadership needing to visit
// Demand, Execution, and Resources separately to get the full picture. Deliberately does NOT
// add its own access gate beyond normal auth: each panel below already fetches from its own
// API route with its own visibility rule (VIEWER for demand/EAC/accuracy, requireInternal for
// skill capacity/capacity-vs-demand, since those name individual resources), and every panel
// already hides itself when it has nothing to show or its fetch is forbidden -- so a
// client-company viewer simply sees fewer panels here, the same as if they'd visited each
// source page individually. The Forecasting nav link itself is still internal-only (see
// Sidebar.tsx) since most of what's genuinely new here is internal-facing.
export default function ForecastPage() {
  return (
    <div>
      <Topbar title="Forecasting" subtitle="Every deterministic forecast in one place — demand, capacity, cost, and how accurate they've been" />
      <div className="p-8 space-y-6">
        <DemandForecastSummary />
        <EACForecast />
        <ForecastAccuracyTracker />
        <SkillCapacityForecast />
        <CapacityVsDemandForecast />
      </div>
    </div>
  );
}
