"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Banknote } from "lucide-react";
import { formatMoney } from "@/lib/clientInvoices";

type Inv = {
  id: string;
  number: string;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  projectName: string;
  displayStatus: "DRAFT" | "SENT" | "PAID" | "VOID" | "OVERDUE";
};
type Project = { id: string; name: string };
type ConnectStatus = { connected: boolean; ready: boolean; detailsSubmitted: boolean; unavailable?: boolean };

const inputCls =
  "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

// SUPER_USER panel: connect the company's own Stripe account (payouts go straight to it), raise
// invoices against projects, send them to clients and void unpaid ones.
export default function ClientBillingSection() {
  const params = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ projectId: "", amount: "", dueDate: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/stripe-connect").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/client-invoices").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/projects").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([s, inv, proj]) => {
        if (cancelled) return;
        setStatus(s);
        setInvoices(inv);
        setProjects((Array.isArray(proj) ? proj : []).map((p: Project) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tick, params]);

  function connect() {
    setBusy(true);
    setError(null);
    fetch("/api/stripe-connect", { method: "POST" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.url) throw new Error(j.error || "Could not start Stripe onboarding");
        window.location.href = j.url;
      })
      .catch((e: Error) => {
        setError(e.message);
        setBusy(false);
      });
  }

  function createInvoice() {
    setBusy(true);
    setError(null);
    fetch("/api/client-invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Could not create invoice");
        setForm({ projectId: form.projectId, amount: "", dueDate: "", description: "" });
        setTick((t) => t + 1);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  function setInvoiceStatus(id: string, next: "SENT" | "VOID") {
    setError(null);
    fetch(`/api/client-invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Could not update invoice");
        setTick((t) => t + 1);
      })
      .catch((e: Error) => setError(e.message));
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
      <p className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
        <Banknote size={15} className="text-accent-600" /> Client billing &amp; online payments
      </p>
      <p className="text-xs text-slate-500 mb-4">
        Connect your own Stripe account so clients can pay invoices by card or bank transfer from their portal. Money goes
        straight to your account — it never passes through Executa.
      </p>

      <div className="flex items-center gap-3 mb-5">
        {status?.ready ? (
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">Stripe connected</span>
        ) : (
          <>
            <button
              onClick={connect}
              disabled={busy || status?.unavailable}
              className="px-3.5 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
            >
              {status?.connected ? "Finish Stripe setup" : "Connect Stripe"}
            </button>
            {status?.unavailable && <span className="text-xs text-amber-700">Stripe isn&apos;t configured on this server yet.</span>}
            {status?.connected && !status.ready && !status.unavailable && (
              <span className="text-xs text-amber-700">Setup incomplete — Stripe needs a few more details.</span>
            )}
          </>
        )}
      </div>

      <p className="text-xs font-medium text-slate-700 mb-2">New invoice</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <select className={inputCls} value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
          <option value="">Project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input className={inputCls} placeholder="Amount (USD)" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        <input className={inputCls} type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
        <button
          onClick={createInvoice}
          disabled={busy || !form.projectId || !form.amount}
          className="px-3 py-2 rounded-lg bg-accent-50 text-accent-700 text-sm font-medium hover:bg-accent-100 disabled:opacity-50"
        >
          Create draft
        </button>
        <input className={`${inputCls} sm:col-span-4`} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}

      <div className="mt-5 divide-y divide-slate-50">
        {invoices.length === 0 && <p className="text-xs text-slate-400">No invoices yet.</p>}
        {invoices.map((inv) => (
          <div key={inv.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="text-slate-700 truncate">
                {inv.number} <span className="text-slate-400">· {inv.projectName}</span>
              </p>
              <p className="text-xs text-slate-400">{inv.dueDate ? `Due ${new Date(inv.dueDate).toLocaleDateString()}` : "No due date"}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-medium text-slate-800">{formatMoney(inv.amountCents, inv.currency)}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{inv.displayStatus}</span>
              {inv.displayStatus === "DRAFT" && (
                <button onClick={() => setInvoiceStatus(inv.id, "SENT")} className="text-xs text-accent-700 hover:underline">Send</button>
              )}
              {(inv.displayStatus === "DRAFT" || inv.displayStatus === "SENT" || inv.displayStatus === "OVERDUE") && (
                <button onClick={() => setInvoiceStatus(inv.id, "VOID")} className="text-xs text-slate-400 hover:text-rose-600">Void</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
