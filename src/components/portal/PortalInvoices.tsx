"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Receipt, CreditCard, ExternalLink } from "lucide-react";
import { formatMoney } from "@/lib/clientInvoices";

type Inv = {
  id: string;
  number: string;
  description: string | null;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  paidAt: string | null;
  receiptUrl: string | null;
  paymentMethod: string | null;
  projectName: string;
  displayStatus: "DRAFT" | "SENT" | "PAID" | "VOID" | "OVERDUE";
};

const STYLES: Record<string, string> = {
  SENT: "bg-slate-100 text-slate-600",
  OVERDUE: "bg-rose-50 text-rose-700",
  PAID: "bg-emerald-50 text-emerald-700",
};

// Receivables from the consulting company with online "Pay now". Rendered only when there is at
// least one non-void invoice, so portals without invoicing look unchanged.
export default function PortalInvoices({ canPay }: { canPay: boolean }) {
  const params = useSearchParams();
  const justPaid = params.get("paid");
  const [items, setItems] = useState<Inv[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/client-invoices")
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: Inv[]) => {
          if (!cancelled) setItems(rows.filter((r) => r.displayStatus !== "VOID" && r.displayStatus !== "DRAFT"));
        })
        .catch(() => {});
    load();
    // After returning from Stripe the webhook may land a moment later; re-poll briefly.
    const t = justPaid ? setTimeout(load, 3000) : null;
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [justPaid]);

  function pay(id: string) {
    setBusyId(id);
    setError(null);
    fetch(`/api/client-invoices/${id}/pay`, { method: "POST" })
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.url) throw new Error(j.error || "Could not start payment");
        window.location.href = j.url;
      })
      .catch((e: Error) => {
        setError(e.message);
        setBusyId(null);
      });
  }

  if (items.length === 0) return null;
  const outstanding = items.filter((i) => i.displayStatus === "SENT" || i.displayStatus === "OVERDUE");
  const total = outstanding.reduce((s, i) => s + i.amountCents, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Receipt size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Invoices</p>
        {outstanding.length > 0 && (
          <span className="ml-auto text-xs text-slate-500">{formatMoney(total)} outstanding</span>
        )}
      </div>
      {justPaid && (
        <p className="px-4 py-2 text-xs bg-emerald-50 text-emerald-700">
          Thanks — your payment is being confirmed. Card payments show as paid within moments; bank (ACH) payments can take a few business days.
        </p>
      )}
      <div className="divide-y divide-slate-50">
        {items.map((inv) => (
          <div key={inv.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-700 truncate">
                {inv.number} <span className="text-slate-400">· {inv.projectName}</span>
              </p>
              <p className="text-xs text-slate-400">
                {inv.displayStatus === "PAID"
                  ? `Paid ${inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : ""}${inv.paymentMethod ? ` · ${inv.paymentMethod === "us_bank_account" ? "bank transfer" : inv.paymentMethod}` : ""}`
                  : inv.dueDate
                    ? `Due ${new Date(inv.dueDate).toLocaleDateString()}`
                    : "No due date"}
                {inv.description ? ` · ${inv.description}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-medium text-slate-800">{formatMoney(inv.amountCents, inv.currency)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STYLES[inv.displayStatus] ?? ""}`}>
                {inv.displayStatus === "SENT" ? "DUE" : inv.displayStatus}
              </span>
              {(inv.displayStatus === "SENT" || inv.displayStatus === "OVERDUE") && canPay && (
                <button
                  onClick={() => pay(inv.id)}
                  disabled={busyId === inv.id}
                  className="inline-flex items-center gap-1.5 text-xs bg-accent-600 text-white rounded-md px-3 py-1.5 disabled:opacity-50"
                >
                  <CreditCard size={12} /> {busyId === inv.id ? "Opening…" : "Pay now"}
                </button>
              )}
              {inv.displayStatus === "PAID" && inv.receiptUrl && (
                <a href={inv.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-700 hover:underline">
                  Receipt <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && <p className="px-4 py-2 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
