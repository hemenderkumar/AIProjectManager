"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, Save, Loader2, Check } from "lucide-react";
import {
  SEVERITIES,
  APP_TYPE_LABELS,
  COVERAGE_LABELS,
  DEFAULT_ASSUMPTIONS,
  defaultTicketsFor,
  computeEstimate,
  type Severity,
  type AppType,
  type CoverageTier,
  type SupportApp,
  type EstimatorAssumptions,
} from "@/lib/supportEstimate";

type ProjectOption = { id: string; name: string };

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `app-${idCounter}`;
}

export default function SupportEstimator({
  projects,
  defaultBlendedHourlyRate,
}: {
  projects: ProjectOption[];
  defaultBlendedHourlyRate?: number;
}) {
  const [apps, setApps] = useState<SupportApp[]>([
    { id: nextId(), name: "Application 1", appType: "WEB_APP", tickets: defaultTicketsFor("WEB_APP") },
  ]);
  const [coverage, setCoverage] = useState<CoverageTier>("BUSINESS_HOURS");
  const [shared, setShared] = useState(true);
  // Default rate comes from the org's Rate Card (set on the Resources page) when available,
  // falling back to the built-in default. Still fully editable below, per session.
  const [assumptions, setAssumptions] = useState<EstimatorAssumptions>(() => ({
    ...DEFAULT_ASSUMPTIONS,
    blendedHourlyRate: defaultBlendedHourlyRate ?? DEFAULT_ASSUMPTIONS.blendedHourlyRate,
  }));
  const [showAssumptions, setShowAssumptions] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const result = useMemo(
    () => computeEstimate(apps, coverage, shared, assumptions),
    [apps, coverage, shared, assumptions]
  );

  function addApp() {
    setApps((prev) => [
      ...prev,
      { id: nextId(), name: `Application ${prev.length + 1}`, appType: "WEB_APP", tickets: defaultTicketsFor("WEB_APP") },
    ]);
  }
  function removeApp(id: string) {
    setApps((prev) => prev.filter((a) => a.id !== id));
  }
  function updateAppName(id: string, name: string) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
  }
  function updateAppType(id: string, appType: AppType) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, appType, tickets: defaultTicketsFor(appType) } : a)));
  }
  function updateTickets(id: string, sev: Severity, value: number) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, tickets: { ...a.tickets, [sev]: value } } : a)));
  }
  function updateAssumption<K extends keyof EstimatorAssumptions>(key: K, value: EstimatorAssumptions[K]) {
    setAssumptions((prev) => ({ ...prev, [key]: value }));
  }

  function summaryText() {
    const mode = result.canShare && shared ? "shared support across applications" : "dedicated support per application";
    const appList = apps.map((a) => `${a.name} (${APP_TYPE_LABELS[a.appType]})`).join(", ");
    return `Ongoing support baseline (${COVERAGE_LABELS[coverage]}, ${mode}): $${Math.round(result.selectedMonthlyCost).toLocaleString()}/mo across ${apps.length} application(s) — ${appList}. Estimated ${result.fteRequired} FTE, ${Math.round(result.totalHours)} support hours/mo. Baseline assumption-based estimate, not a quote.`;
  }

  async function saveToProject() {
    if (!selectedProjectId) return;
    setSaving(true);
    setSaved(false);
    await fetch(`/api/projects/${selectedProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ongoingSupportMonthlyCost: Math.round(result.selectedMonthlyCost),
        ongoingSupportPlan: summaryText(),
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 max-w-2xl">
        Estimates ongoing support cost from ticket-volume assumptions by severity, resolution effort, and
        coverage window — not AI-generated, so every number below is a plain, editable assumption you can
        adjust. Add more than one application to see the savings from pooling them under shared support.
      </p>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">Applications ({apps.length})</p>
          <button
            onClick={addApp}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >
            <Plus size={14} /> Add application
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {apps.map((app) => {
            const appResult = result.perAppHours.find((a) => a.id === app.id);
            return (
              <div key={app.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={app.name}
                    onChange={(e) => updateAppName(app.id, e.target.value)}
                    className="text-sm font-medium border border-slate-200 rounded-lg px-2.5 py-1.5 flex-1"
                  />
                  <select
                    value={app.appType}
                    onChange={(e) => updateAppType(app.id, e.target.value as AppType)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    {(Object.keys(APP_TYPE_LABELS) as AppType[]).map((t) => (
                      <option key={t} value={t}>{APP_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  {apps.length > 1 && (
                    <button onClick={() => removeApp(app.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  {SEVERITIES.map((sev) => (
                    <label key={sev} className="block">
                      <span className="block text-[10px] font-medium text-slate-500 mb-0.5">{sev} tickets/mo</span>
                      <input
                        type="number"
                        min={0}
                        value={app.tickets[sev]}
                        onChange={(e) => updateTickets(app.id, sev, Number(e.target.value))}
                        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  ≈ {appResult ? appResult.hours.toFixed(1) : 0} support hours/mo · dedicated cost ≈ $
                  {appResult ? Math.round(appResult.dedicatedCost).toLocaleString() : 0}/mo
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Support coverage</span>
            <select
              value={coverage}
              onChange={(e) => setCoverage(e.target.value as CoverageTier)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5"
            >
              {(Object.keys(COVERAGE_LABELS) as CoverageTier[]).map((c) => (
                <option key={c} value={c}>{COVERAGE_LABELS[c]}</option>
              ))}
            </select>
          </label>
          <label className={`flex items-center gap-2 mt-5 ${!result.canShare ? "opacity-40" : ""}`}>
            <input
              type="checkbox"
              checked={shared}
              disabled={!result.canShare}
              onChange={(e) => setShared(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-700">
              Provide shared support across these applications
              {!result.canShare && <span className="text-xs text-slate-400"> (add 2+ apps to compare)</span>}
            </span>
          </label>
        </div>

        <button
          onClick={() => setShowAssumptions((s) => !s)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        >
          {showAssumptions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Assumptions (editable)
        </button>
        {showAssumptions && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 rounded-lg p-3">
            <div>
              <p className="text-[11px] font-medium text-slate-600 mb-1.5">Resolution hours per ticket</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SEVERITIES.map((sev) => (
                  <label key={sev} className="block">
                    <span className="block text-[10px] text-slate-500">{sev}</span>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      value={assumptions.resolutionHours[sev]}
                      onChange={(e) =>
                        updateAssumption("resolutionHours", { ...assumptions.resolutionHours, [sev]: Number(e.target.value) })
                      }
                      className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="block">
                <span className="block text-[10px] text-slate-500">Blended hourly rate ($)</span>
                <input
                  type="number"
                  min={0}
                  value={assumptions.blendedHourlyRate}
                  onChange={(e) => updateAssumption("blendedHourlyRate", Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] text-slate-500">Effective hours / FTE / month</span>
                <input
                  type="number"
                  min={1}
                  value={assumptions.effectiveHoursPerFte}
                  onChange={(e) => updateAssumption("effectiveHoursPerFte", Number(e.target.value))}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] text-slate-500">Shared-support efficiency discount (%)</span>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={Math.round(assumptions.sharedDiscount * 100)}
                  onChange={(e) => updateAssumption("sharedDiscount", Number(e.target.value) / 100)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1"
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-700 mb-3">Estimate</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <Stat label="Support hours / mo" value={result.totalHours.toFixed(1)} />
          <Stat label="FTE required" value={result.fteRequired.toFixed(2)} />
          <Stat label="Monthly baseline" value={`$${Math.round(result.selectedMonthlyCost).toLocaleString()}`} highlight />
        </div>
        {result.canShare && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-xs">
            <div className={`rounded-lg border p-3 ${!shared ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200"}`}>
              <p className="text-slate-500">Dedicated (per-app teams)</p>
              <p className="text-base font-semibold text-slate-800">${Math.round(result.dedicatedMonthlyCost).toLocaleString()}/mo</p>
            </div>
            <div className={`rounded-lg border p-3 ${shared ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200"}`}>
              <p className="text-slate-500">Shared (pooled team)</p>
              <p className="text-base font-semibold text-emerald-700">${Math.round(result.sharedMonthlyCost).toLocaleString()}/mo</p>
              {result.savingsFromSharing > 0 && (
                <p className="text-[11px] text-emerald-600 mt-0.5">Saves ${Math.round(result.savingsFromSharing).toLocaleString()}/mo vs. dedicated</p>
              )}
            </div>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mb-3">
          Annualized: ${Math.round(result.selectedMonthlyCost * 12).toLocaleString()}/yr. This is a baseline
          planning estimate from the assumptions above, not a vendor quote.
        </p>

        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white flex-1"
          >
            <option value="">Save baseline to a project...</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={saveToProject}
            disabled={!selectedProjectId || saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
            {saved ? "Saved" : "Save to project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 text-center">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${highlight ? "text-indigo-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
