"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { Plus, Trash2, Sparkles } from "lucide-react";
import {
  SOURCING_LABELS,
  PRICING_MODEL_LABELS,
  type RateCardEntry,
  type RoleMixRow,
  blendedRate,
  rowCost,
  computeMixTotals,
} from "@/lib/deliveryModel";

const PRICING_MODELS = ["FIXED_BID", "TIME_AND_MATERIALS", "HYBRID"] as const;

export default function DeliveryTab({ detail, rateCards }: { detail: ProjectDetail; rateCards: RateCardEntry[] }) {
  const router = useRouter();
  const p = detail.project;
  const rows = useMemo(() => detail.deliveryRoleMix ?? [], [detail.deliveryRoleMix]);

  const [recommending, setRecommending] = useState(false);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [pricingModel, setPricingModel] = useState(p.pricingModel ?? "");
  const [fixedBidPrice, setFixedBidPrice] = useState(p.fixedBidPrice ?? 0);
  const [showForm, setShowForm] = useState(false);
  const [newRole, setNewRole] = useState({ role: "", hours: 0, onsitePercent: 100, offshorePercent: 0, contractorPercent: 0 });

  const totals = useMemo(() => computeMixTotals(rateCards, rows as RoleMixRow[]), [rateCards, rows]);

  async function getRecommendation() {
    setRecommending(true);
    setRecommendError(null);
    const res = await fetch("/api/ai/delivery-recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: p.id }),
    });
    setRecommending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setRecommendError(data?.error ?? "Couldn't generate a recommendation.");
      return;
    }
    router.refresh();
  }

  async function savePricingModel(value: string) {
    setPricingModel(value);
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricingModel: value || null }),
    });
    router.refresh();
  }

  async function saveFixedBidPrice(value: number) {
    setFixedBidPrice(value);
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixedBidPrice: value }),
    });
  }

  async function updateRow(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/projects/${p.id}/delivery-mix/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
  }

  async function removeRow(id: string) {
    await fetch(`/api/projects/${p.id}/delivery-mix/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function addRow() {
    if (!newRole.role.trim()) return;
    await fetch(`/api/projects/${p.id}/delivery-mix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newRole),
    });
    setNewRole({ role: "", hours: 0, onsitePercent: 100, offshorePercent: 0, contractorPercent: 0 });
    setShowForm(false);
    router.refresh();
  }

  const showFixedBid = pricingModel === "FIXED_BID" || pricingModel === "HYBRID";

  return (
    <div className="max-w-4xl space-y-4">
      <Card
        title="AI Sourcing & Pricing Recommendation"
        action={
          <button
            onClick={getRecommendation}
            disabled={recommending}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
          >
            <Sparkles size={14} /> {recommending ? "Thinking..." : rows.length ? "Re-run recommendation" : "Get recommendation"}
          </button>
        }
      >
        <p className="text-xs text-slate-500 mb-3">
          The AI proposes a role breakdown, an onsite/offshore/contractor split per role, and which pricing
          model fits. It never invents dollar amounts — cost is always computed from the Rate Card in
          Resources. Everything below is fully editable.
        </p>
        {recommendError && <p className="text-xs text-rose-600 mb-2">{recommendError}</p>}
        {p.deliveryRationale && (
          <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">
            {p.deliveryRationale}
          </div>
        )}
        {!p.deliveryRationale && !recommending && (
          <p className="text-xs text-slate-400">No recommendation generated yet.</p>
        )}
      </Card>

      <Card title="Pricing Model">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Model">
            <select value={pricingModel} onChange={(e) => savePricingModel(e.target.value)} className={inputCls}>
              <option value="">Not selected</option>
              {PRICING_MODELS.map((m) => (
                <option key={m} value={m}>{PRICING_MODEL_LABELS[m]}</option>
              ))}
            </select>
          </Field>
          {showFixedBid && (
            <Field label="Fixed bid price ($)">
              <input
                type="number"
                min={0}
                value={fixedBidPrice}
                onChange={(e) => setFixedBidPrice(Number(e.target.value))}
                onBlur={(e) => saveFixedBidPrice(Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Total hours" value={totals.totalHours.toLocaleString()} />
        <SummaryStat label="Recommended mix cost" value={`$${Math.round(totals.recommendedCost).toLocaleString()}`} />
        <SummaryStat label="If all onsite" value={`$${Math.round(totals.allOnsiteCost).toLocaleString()}`} />
        <SummaryStat label="Savings vs. all onsite" value={`$${Math.round(totals.savingsVsAllOnsite).toLocaleString()}`} highlight />
      </div>

      <Card
        title={`Sourcing Mix by Role (${rows.length})`}
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >
            <Plus size={14} /> Add Role
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Field label="Role">
                <input value={newRole.role} onChange={(e) => setNewRole((f) => ({ ...f, role: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Hours">
                <input type="number" min={0} value={newRole.hours} onChange={(e) => setNewRole((f) => ({ ...f, hours: Number(e.target.value) }))} className={inputCls} />
              </Field>
              <Field label="Onsite %">
                <input type="number" min={0} max={100} value={newRole.onsitePercent} onChange={(e) => setNewRole((f) => ({ ...f, onsitePercent: Number(e.target.value) }))} className={inputCls} />
              </Field>
              <Field label="Offshore %">
                <input type="number" min={0} max={100} value={newRole.offshorePercent} onChange={(e) => setNewRole((f) => ({ ...f, offshorePercent: Number(e.target.value) }))} className={inputCls} />
              </Field>
              <Field label="Contractor %">
                <input type="number" min={0} max={100} value={newRole.contractorPercent} onChange={(e) => setNewRole((f) => ({ ...f, contractorPercent: Number(e.target.value) }))} className={inputCls} />
              </Field>
            </div>
            <PrimaryButton onClick={addRow}>Add role</PrimaryButton>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium text-right">Hours</th>
              <th className="py-2 font-medium text-right">Onsite %</th>
              <th className="py-2 font-medium text-right">Offshore %</th>
              <th className="py-2 font-medium text-right">Contractor %</th>
              <th className="py-2 font-medium text-right">Blended rate</th>
              <th className="py-2 font-medium text-right">Cost</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mixRow: RoleMixRow = row as RoleMixRow;
              const rate = blendedRate(rateCards, mixRow);
              const cost = rowCost(rateCards, mixRow);
              const mixSum = row.onsitePercent + row.offshorePercent + row.contractorPercent;
              return (
                <tr key={row.id} className="border-b border-slate-50 last:border-0 align-top">
                  <td className="py-2.5 font-medium text-slate-800">
                    {row.role}
                    {row.createdByAi && <p className="text-xs text-indigo-500 font-normal">AI suggested</p>}
                    {row.rationale && <p className="text-xs text-slate-400 font-normal max-w-xs">{row.rationale}</p>}
                  </td>
                  <td className="py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      defaultValue={row.hours}
                      onBlur={(e) => updateRow(row.id, { hours: Number(e.target.value) })}
                      className="w-20 text-right text-sm border border-slate-200 rounded px-1.5 py-1"
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={row.onsitePercent}
                      onBlur={(e) => updateRow(row.id, { onsitePercent: Number(e.target.value) })}
                      className="w-16 text-right text-sm border border-slate-200 rounded px-1.5 py-1"
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={row.offshorePercent}
                      onBlur={(e) => updateRow(row.id, { offshorePercent: Number(e.target.value) })}
                      className="w-16 text-right text-sm border border-slate-200 rounded px-1.5 py-1"
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={row.contractorPercent}
                      onBlur={(e) => updateRow(row.id, { contractorPercent: Number(e.target.value) })}
                      className="w-16 text-right text-sm border border-slate-200 rounded px-1.5 py-1"
                    />
                    {mixSum !== 100 && <p className="text-xs text-amber-600 mt-0.5">Sums to {mixSum}%</p>}
                  </td>
                  <td className="py-2.5 text-right text-slate-600">${rate.toFixed(0)}/hr</td>
                  <td className="py-2.5 text-right text-slate-800 font-medium">${Math.round(cost).toLocaleString()}</td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => removeRow(row.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-slate-400">
                  No roles yet — get an AI recommendation or add one manually. Note: {SOURCING_LABELS.ONSITE}/
                  {SOURCING_LABELS.OFFSHORE}/{SOURCING_LABELS.CONTRACTOR} % should sum to 100 per role.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-lg p-2.5 text-center ${highlight ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? "text-emerald-700" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}
