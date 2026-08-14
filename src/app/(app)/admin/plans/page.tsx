"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ArrowLeft, Plus, Trash2, Power } from "lucide-react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  stripePriceId: string | null;
  priceCents: number | null;
  billingInterval: string;
  billingModel: string;
  projectLimit: number | null;
  seatLimit: number | null;
  sortOrder: number;
  isActive: boolean;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

// Admin-managed pricing tiers -- this is the single source of truth the /billing page reads
// from, so pricing/limits can change without a code deploy. Each plan's stripePriceId must
// point at a real Price object created in the Stripe Dashboard; a plan without one shows as
// "Coming soon" on /billing rather than blocking on it here.
export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    stripePriceId: "",
    priceDollars: "",
    billingInterval: "month",
    billingModel: "flat",
    projectLimit: "",
    seatLimit: "",
  });

  function load() {
    fetch("/api/admin/plans").then((r) => r.json()).then((data) => {
      setPlans(data);
      setLoading(false);
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function createPlan(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || undefined,
        stripePriceId: form.stripePriceId || undefined,
        priceCents: form.priceDollars ? Math.round(parseFloat(form.priceDollars) * 100) : undefined,
        billingInterval: form.billingInterval,
        billingModel: form.billingModel,
        projectLimit: form.projectLimit ? parseInt(form.projectLimit, 10) : undefined,
        seatLimit: form.seatLimit ? parseInt(form.seatLimit, 10) : undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({ name: "", description: "", stripePriceId: "", priceDollars: "", billingInterval: "month", billingModel: "flat", projectLimit: "", seatLimit: "" });
      setShowForm(false);
      load();
    }
  }

  async function patchPlan(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/plans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
    }
  }

  async function deletePlan(id: string) {
    if (!confirm("Delete this plan? Organizations already subscribed to it are unaffected, but it won't be offered going forward.")) return;
    const res = await fetch(`/api/admin/plans/${id}`, { method: "DELETE" });
    if (res.ok) setPlans((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div>
      <Topbar
        title="Plans"
        subtitle="Pricing tiers offered on /billing — everything here is editable without a deploy"
        action={
          <Link href="/admin" className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
            <ArrowLeft size={14} /> Back to Admin
          </Link>
        }
      />
      <div className="p-8">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-900">All plans</p>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700"
          >
            <Plus size={14} /> New plan
          </button>
        </div>

        {showForm && (
          <form onSubmit={createPlan} className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5 mb-6 grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Pro" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Stripe Price ID</label>
              <input value={form.stripePriceId} onChange={(e) => setForm((f) => ({ ...f, stripePriceId: e.target.value }))} className={inputCls} placeholder="price_..." />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
              <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} placeholder="Shown under the plan name on /billing" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Price (USD, display only)</label>
              <input type="number" step="0.01" value={form.priceDollars} onChange={(e) => setForm((f) => ({ ...f, priceDollars: e.target.value }))} className={inputCls} placeholder="49.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Billing interval</label>
              <select value={form.billingInterval} onChange={(e) => setForm((f) => ({ ...f, billingInterval: e.target.value }))} className={inputCls}>
                <option value="month">Monthly</option>
                <option value="year">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Billing model</label>
              <select value={form.billingModel} onChange={(e) => setForm((f) => ({ ...f, billingModel: e.target.value }))} className={inputCls}>
                <option value="flat">Flat (whole org)</option>
                <option value="per_seat">Per seat (bulk/volume discounts configured on the Stripe Price)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Project limit (blank = unlimited)</label>
              <input type="number" value={form.projectLimit} onChange={(e) => setForm((f) => ({ ...f, projectLimit: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Seat limit (blank = unlimited)</label>
              <input type="number" value={form.seatLimit} onChange={(e) => setForm((f) => ({ ...f, seatLimit: e.target.value }))} className={inputCls} />
            </div>
            <div className="col-span-2 flex justify-end">
              <button type="submit" disabled={saving} className="text-sm font-medium px-4 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50">
                {saving ? "Creating…" : "Create plan"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">Limits</th>
                  <th className="px-4 py-3">Stripe price</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className={`border-b border-slate-50 last:border-0 ${p.isActive ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{p.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.priceCents != null ? `$${(p.priceCents / 100).toFixed(2)}/${p.billingInterval}` : "Contact us"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.billingModel === "per_seat" ? "Per seat" : "Flat"}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.projectLimit ?? "∞"} projects · {p.seatLimit ?? "∞"} seats
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.stripePriceId ? (
                        <span className="font-mono text-xs">{p.stripePriceId}</span>
                      ) : (
                        <span className="text-amber-600 text-xs">Not connected</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => patchPlan(p.id, { isActive: !p.isActive })}
                          className={`flex items-center gap-1 text-xs ${p.isActive ? "text-slate-500 hover:text-amber-600" : "text-slate-500 hover:text-emerald-600"}`}
                        >
                          <Power size={13} /> {p.isActive ? "Disable" : "Enable"}
                        </button>
                        <button onClick={() => deletePlan(p.id)} className="text-slate-400 hover:text-rose-600">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-slate-400">No plans yet — create one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
