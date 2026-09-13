"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ArrowLeft, Plus, Trash2, TrendingUp, Users, Gift, AlertTriangle, DollarSign } from "lucide-react";

type Category = "PAYROLL" | "CONTRACTOR" | "INFRASTRUCTURE" | "TOOLING" | "MARKETING" | "LEGAL_AND_ADMIN" | "OTHER";

type Expense = {
  id: string;
  category: Category;
  payeeName: string;
  amountCents: number;
  currency: string;
  expenseDate: string;
  isRecurring: boolean;
  notes: string | null;
  createdBy: string | null;
};

type MrrSummary = {
  mrrCents: number;
  arrCents: number;
  payingOrgCount: number;
  byPlan: Array<{ planId: string; planName: string; orgCount: number; mrrCents: number }>;
};

type OrgStatusCounts = { trialing: number; active: number; pastDue: number; canceled: number; comped: number; total: number };

type ProfitabilityMonth = { month: string; revenueCents: number; expenseCents: number; netCents: number };

const CATEGORY_LABELS: Record<Category, string> = {
  PAYROLL: "Payroll",
  CONTRACTOR: "Contractor",
  INFRASTRUCTURE: "Infrastructure",
  TOOLING: "Tooling",
  MARKETING: "Marketing",
  LEGAL_AND_ADMIN: "Legal & Admin",
  OTHER: "Other",
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

function formatCents(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? "-" : "";
  return `${sign}$${Math.abs(dollars).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// Executa's own business financials -- revenue (MRR/ARR from real paying subscriptions),
// operating expenses (a manual ledger admins log after paying someone elsewhere -- this page
// never moves money), and the profitability those two roll up into. Distinct from the
// per-client budget/accounting export and the promo-code financial dashboard, which both
// exist elsewhere in Admin.
export default function FinancePage() {
  const [mrr, setMrr] = useState<MrrSummary | null>(null);
  const [orgCounts, setOrgCounts] = useState<OrgStatusCounts | null>(null);
  const [profitability, setProfitability] = useState<ProfitabilityMonth[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    category: "PAYROLL" as Category,
    payeeName: "",
    amountDollars: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    isRecurring: false,
    notes: "",
  });

  function load() {
    Promise.all([
      fetch("/api/admin/finance/summary").then((r) => r.json()),
      fetch("/api/admin/finance/profitability?months=6").then((r) => r.json()),
      fetch("/api/admin/finance/expenses").then((r) => r.json()),
    ]).then(([summary, profitData, expenseData]) => {
      setMrr(summary.mrr);
      setOrgCounts(summary.orgCounts);
      setProfitability(profitData);
      setExpenses(expenseData);
      setLoading(false);
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function createExpense(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/finance/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: form.category,
        payeeName: form.payeeName,
        amountCents: Math.round(parseFloat(form.amountDollars || "0") * 100),
        expenseDate: form.expenseDate,
        isRecurring: form.isRecurring,
        notes: form.notes || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save expense");
      return;
    }
    setForm({ category: "PAYROLL", payeeName: "", amountDollars: "", expenseDate: new Date().toISOString().slice(0, 10), isRecurring: false, notes: "" });
    setShowForm(false);
    load();
  }

  async function removeExpense(id: string) {
    if (!confirm("Delete this expense entry? This only removes the internal record -- it doesn't affect any real payment already made.")) return;
    const res = await fetch(`/api/admin/finance/expenses/${id}`, { method: "DELETE" });
    if (res.ok) setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div>
      <Topbar
        title="Finance"
        subtitle="Executa's own revenue, expenses, and profitability -- not a client's project budget"
        action={
          <Link href="/admin" className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
            <ArrowLeft size={14} /> Back to Admin
          </Link>
        }
      />
      <div className="p-8 space-y-8">
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <section>
              <p className="text-sm font-semibold text-slate-900 mb-3">Revenue</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon={<TrendingUp size={14} />} label="MRR" value={mrr ? formatCents(mrr.mrrCents) : "—"} />
                <KpiCard icon={<TrendingUp size={14} />} label="ARR" value={mrr ? formatCents(mrr.arrCents) : "—"} />
                <KpiCard icon={<Users size={14} />} label="Paying orgs" value={mrr ? String(mrr.payingOrgCount) : "—"} />
                <KpiCard icon={<Gift size={14} />} label="Comped orgs" value={orgCounts ? String(orgCounts.comped) : "—"} hint="Free access, not counted in MRR" />
              </div>
              {orgCounts && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                  <KpiCard icon={<Users size={14} />} label="Trialing" value={String(orgCounts.trialing)} />
                  <KpiCard icon={<Users size={14} />} label="Active (paying)" value={String(orgCounts.active)} />
                  <KpiCard icon={<AlertTriangle size={14} />} label="Past due" value={String(orgCounts.pastDue)} />
                  <KpiCard icon={<AlertTriangle size={14} />} label="Canceled" value={String(orgCounts.canceled)} />
                </div>
              )}
              {mrr && mrr.byPlan.length > 0 && (
                <div className="mt-4 bg-white rounded-xl border border-slate-200/70 shadow-sm p-4">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">MRR by plan</p>
                  <div className="space-y-1.5">
                    {mrr.byPlan.map((p) => (
                      <div key={p.planId} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{p.planName} <span className="text-slate-400 text-xs">({p.orgCount} org{p.orgCount === 1 ? "" : "s"})</span></span>
                        <span className="font-medium text-slate-800">{formatCents(p.mrrCents)}/mo</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section>
              <p className="text-sm font-semibold text-slate-900 mb-3">Profitability (last 6 months)</p>
              <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
                      <th className="px-4 py-3">Month</th>
                      <th className="px-4 py-3">Revenue</th>
                      <th className="px-4 py-3">Expenses</th>
                      <th className="px-4 py-3">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitability.map((m) => (
                      <tr key={m.month} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 text-slate-700 font-medium">{m.month}</td>
                        <td className="px-4 py-3 text-emerald-700">{formatCents(m.revenueCents)}</td>
                        <td className="px-4 py-3 text-rose-600">{formatCents(m.expenseCents)}</td>
                        <td className={`px-4 py-3 font-medium ${m.netCents >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{formatCents(m.netCents)}</td>
                      </tr>
                    ))}
                    {profitability.length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-slate-400">No revenue or expense data yet for this window.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 mt-2">Revenue is read from Stripe&apos;s paid invoices; if Stripe isn&apos;t configured this will show as $0.</p>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-900">Expenses</p>
                <button
                  onClick={() => setShowForm((s) => !s)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700"
                >
                  <Plus size={14} /> Log expense
                </button>
              </div>

              {showForm && (
                <form onSubmit={createExpense} className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5 mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Category</label>
                    <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))} className={inputCls}>
                      {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                        <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Payee</label>
                    <input required value={form.payeeName} onChange={(e) => setForm((f) => ({ ...f, payeeName: e.target.value }))} className={inputCls} placeholder="Employee, contractor, or vendor name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Amount (USD)</label>
                    <input required type="number" step="0.01" min="0.01" value={form.amountDollars} onChange={(e) => setForm((f) => ({ ...f, amountDollars: e.target.value }))} className={inputCls} placeholder="5000.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Date paid</label>
                    <input required type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={form.isRecurring} onChange={(e) => setForm((f) => ({ ...f, isRecurring: e.target.checked }))} />
                      Recurring (e.g. monthly payroll) -- log each payment as it happens; this just flags the pattern
                    </label>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
                    <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
                  </div>
                  {error && <p className="col-span-2 text-xs text-rose-600">{error}</p>}
                  <div className="col-span-2 flex justify-end">
                    <button type="submit" disabled={saving} className="text-sm font-medium px-4 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50">
                      {saving ? "Saving…" : "Log expense"}
                    </button>
                  </div>
                </form>
              )}

              <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Payee</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 text-slate-500">{new Date(exp.expenseDate).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-slate-600">{CATEGORY_LABELS[exp.category]}{exp.isRecurring ? " (recurring)" : ""}</td>
                        <td className="px-4 py-3 text-slate-700">{exp.payeeName}{exp.notes && <span className="text-slate-400"> — {exp.notes}</span>}</td>
                        <td className="px-4 py-3 text-slate-800 font-medium flex items-center gap-1"><DollarSign size={12} className="text-slate-300" />{formatCents(exp.amountCents)}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => removeExpense(exp.id)} className="text-slate-400 hover:text-rose-600">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {expenses.length === 0 && (
                      <tr><td colSpan={5} className="py-6 text-center text-slate-400">No expenses logged yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">{icon} {label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
