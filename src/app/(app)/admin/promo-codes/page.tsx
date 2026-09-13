"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ArrowLeft, Plus, Power, Copy, Check, Users, Tag, Megaphone, DollarSign, TrendingUp, Repeat } from "lucide-react";

type Scope = "SPECIFIC_ORG" | "GROUP" | "GENERIC";
type Duration = "ONCE" | "REPEATING" | "FOREVER";

type PromoCode = {
  id: string;
  code: string;
  percentOff: number;
  scope: Scope;
  duration: Duration;
  durationInMonths: number | null;
  targetOrganizationId: string | null;
  groupLabel: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
};

type Org = { id: string; name: string };

type FinancialSummary = {
  totalRedemptions: number;
  totalDiscountGivenCents: number;
  totalSubscriptionRevenueCents: number;
  estimatedActiveMonthlyDiscountCents: number;
  byCode: Array<{ promoCodeId: string; redemptions: number; totalDiscountCents: number; totalRevenueCents: number }>;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const SCOPE_META: Record<Scope, { label: string; icon: React.ReactNode; hint: string }> = {
  SPECIFIC_ORG: { label: "Specific organization", icon: <Users size={12} />, hint: "Auto-applied at checkout for one named org -- they never have to type a code." },
  GROUP: { label: "Group", icon: <Tag size={12} />, hint: "One shared code for a defined cohort (e.g. beta partners). Contained by max redemptions." },
  GENERIC: { label: "Public / social", icon: <Megaphone size={12} />, hint: "Anyone with the code can redeem it at Stripe Checkout's \"Add promotion code\" field." },
};

// Admin-only promo code generator, backed by real Stripe Coupons + Promotion Codes (see
// lib/promo.ts). Three scopes cover the three real distribution patterns: a personal invite
// to one named prospect (auto-applied, no code to type), a shared code for a defined group,
// and a public code meant to circulate on social media or a landing page.
export default function PromoCodesPage() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [financials, setFinancials] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    percentOff: "20",
    scope: "GENERIC" as Scope,
    targetOrganizationId: "",
    groupLabel: "",
    maxRedemptions: "",
    expiresAt: "",
    duration: "ONCE" as Duration,
    durationInMonths: "3",
  });

  function load() {
    Promise.all([
      fetch("/api/admin/promo-codes").then((r) => r.json()),
      fetch("/api/admin/organizations").then((r) => r.json()),
      fetch("/api/admin/promo-codes/financials").then((r) => r.json()),
    ]).then(([promoData, orgData, financialData]) => {
      setPromos(promoData);
      setOrgs(orgData);
      setFinancials(financialData);
      setLoading(false);
    });
  }

  function codeFinancials(promoCodeId: string) {
    return financials?.byCode.find((c) => c.promoCodeId === promoCodeId) ?? { redemptions: 0, totalDiscountCents: 0, totalRevenueCents: 0 };
  }

  useEffect(() => {
    load();
  }, []);

  async function createPromo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/promo-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: form.code,
        percentOff: parseInt(form.percentOff, 10),
        scope: form.scope,
        targetOrganizationId: form.scope === "SPECIFIC_ORG" ? form.targetOrganizationId || undefined : undefined,
        groupLabel: form.scope === "GROUP" ? form.groupLabel || undefined : undefined,
        maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions, 10) : undefined,
        expiresAt: form.expiresAt || undefined,
        duration: form.duration,
        durationInMonths: form.duration === "REPEATING" ? parseInt(form.durationInMonths, 10) : undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create promo code");
      return;
    }
    setForm({ code: "", percentOff: "20", scope: "GENERIC", targetOrganizationId: "", groupLabel: "", maxRedemptions: "", expiresAt: "", duration: "ONCE", durationInMonths: "3" });
    setShowForm(false);
    load();
  }

  async function toggleActive(p: PromoCode) {
    const res = await fetch(`/api/admin/promo-codes/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPromos((prev) => prev.map((row) => (row.id === p.id ? updated : row)));
    }
  }

  function copyCode(p: PromoCode) {
    navigator.clipboard.writeText(p.code).catch(() => {});
    setCopiedId(p.id);
    setTimeout(() => setCopiedId((id) => (id === p.id ? null : id)), 1500);
  }

  function orgName(id: string | null) {
    if (!id) return null;
    return orgs.find((o) => o.id === id)?.name ?? "Unknown org";
  }

  return (
    <div>
      <Topbar
        title="Promo Codes"
        subtitle="Percent-off discounts, backed by real Stripe coupons -- generate, share, and track redemptions"
        action={
          <Link href="/admin" className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
            <ArrowLeft size={14} /> Back to Admin
          </Link>
        }
      />
      <div className="p-8">
        {financials && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <FinancialCard icon={<Users size={14} />} label="Total redemptions" value={String(financials.totalRedemptions)} />
            <FinancialCard icon={<DollarSign size={14} />} label="Total discount given" value={formatCents(financials.totalDiscountGivenCents)} hint="Lifetime, realized" />
            <FinancialCard icon={<Repeat size={14} />} label="Active recurring discount" value={`${formatCents(financials.estimatedActiveMonthlyDiscountCents)}/mo`} hint="REPEATING/FOREVER promos on still-active subscriptions" />
            <FinancialCard icon={<TrendingUp size={14} />} label="Revenue from promo signups" value={formatCents(financials.totalSubscriptionRevenueCents)} hint="What they actually paid, post-discount" />
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-900">All promo codes</p>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700"
          >
            <Plus size={14} /> New promo code
          </button>
        </div>

        {showForm && (
          <form onSubmit={createPromo} className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5 mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Code</label>
              <input
                required
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className={`${inputCls} font-mono uppercase`}
                placeholder="LAUNCH50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Percent off (10-100)</label>
              <input
                required
                type="number"
                min={10}
                max={100}
                step={1}
                value={form.percentOff}
                onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))}
                className={inputCls}
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Who is this for?</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(SCOPE_META) as Scope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, scope: s }))}
                    className={`text-left rounded-lg border px-3 py-2 text-xs transition-colors ${
                      form.scope === s ? "border-accent-400 bg-accent-50 text-accent-800" : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-medium mb-0.5">{SCOPE_META[s].icon} {SCOPE_META[s].label}</span>
                    <span className="text-[11px] leading-snug block text-slate-400">{SCOPE_META[s].hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {form.scope === "SPECIFIC_ORG" && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Organization</label>
                <select
                  required
                  value={form.targetOrganizationId}
                  onChange={(e) => setForm((f) => ({ ...f, targetOrganizationId: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">Select an organization…</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}
            {form.scope === "GROUP" && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Group label</label>
                <input
                  required
                  value={form.groupLabel}
                  onChange={(e) => setForm((f) => ({ ...f, groupLabel: e.target.value }))}
                  className={inputCls}
                  placeholder="Beta partners"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Max redemptions (blank = unlimited)</label>
              <input
                type="number"
                min={1}
                value={form.maxRedemptions}
                onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                className={inputCls}
                placeholder={form.scope === "GENERIC" ? "Recommended for public codes" : ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Expires (blank = never)</label>
              <input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} className={inputCls} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Applies to</label>
              <select value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value as Duration }))} className={inputCls}>
                <option value="ONCE">First invoice only</option>
                <option value="REPEATING">A number of months</option>
                <option value="FOREVER">The life of the subscription</option>
              </select>
            </div>
            {form.duration === "REPEATING" && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Number of months</label>
                <input
                  type="number"
                  min={1}
                  value={form.durationInMonths}
                  onChange={(e) => setForm((f) => ({ ...f, durationInMonths: e.target.value }))}
                  className={inputCls}
                />
              </div>
            )}

            {error && <p className="col-span-2 text-xs text-rose-600">{error}</p>}
            <div className="col-span-2 flex justify-end">
              <button type="submit" disabled={saving} className="text-sm font-medium px-4 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50">
                {saving ? "Creating…" : "Create promo code"}
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
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Off</th>
                  <th className="px-4 py-3">For</th>
                  <th className="px-4 py-3">Redemptions</th>
                  <th className="px-4 py-3">Discount given</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => {
                  const cf = codeFinancials(p.id);
                  return (
                  <tr key={p.id} className={`border-b border-slate-50 last:border-0 ${p.isActive ? "" : "opacity-50"}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => copyCode(p)} className="flex items-center gap-1.5 font-mono text-xs font-medium text-slate-800 hover:text-accent-700">
                        {p.code} {copiedId === p.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} className="text-slate-300" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.percentOff}%</td>
                    <td className="px-4 py-3 text-slate-500">
                      <span className="flex items-center gap-1.5">
                        {SCOPE_META[p.scope].icon}
                        {p.scope === "SPECIFIC_ORG" ? orgName(p.targetOrganizationId) : p.scope === "GROUP" ? p.groupLabel : "Public"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.redemptionCount}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{cf.totalDiscountCents ? formatCents(cf.totalDiscountCents) : "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{cf.totalRevenueCents ? formatCents(cf.totalRevenueCents) : "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : "Never"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => toggleActive(p)}
                          className={`flex items-center gap-1 text-xs ${p.isActive ? "text-slate-500 hover:text-amber-600" : "text-slate-500 hover:text-emerald-600"}`}
                        >
                          <Power size={13} /> {p.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {promos.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-slate-400">No promo codes yet — create one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FinancialCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">{icon} {label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
