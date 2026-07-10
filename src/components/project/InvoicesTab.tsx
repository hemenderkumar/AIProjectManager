"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDate } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-emerald-50 text-emerald-700",
  OVERDUE: "bg-rose-50 text-rose-700",
  DISPUTED: "bg-slate-100 text-slate-600",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export default function InvoicesTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    vendor: "",
    invoiceNumber: "",
    amount: 0,
    invoiceDate: "",
    dueDate: "",
    status: "PENDING",
    notes: "",
  });

  const invoices = detail.invoices ?? [];
  const totalInvoiced = invoices.reduce((s, i) => s + i.amount, 0);
  const totalPaid = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
  const totalOutstanding = invoices.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.amount, 0);
  const overdueCount = invoices.filter((i) => i.status === "OVERDUE").length;

  async function submit() {
    if (!form.vendor.trim()) return;
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ vendor: "", invoiceNumber: "", amount: 0, invoiceDate: "", dueDate: "", status: "PENDING", notes: "" });
    router.refresh();
  }

  async function updateStatus(invoiceId: string, status: string) {
    await fetch(`/api/projects/${detail.project.id}/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function remove(invoiceId: string) {
    await fetch(`/api/projects/${detail.project.id}/invoices/${invoiceId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <SummaryStat label="Total invoiced" value={`$${totalInvoiced.toLocaleString()}`} />
        <SummaryStat label="Paid" value={`$${totalPaid.toLocaleString()}`} />
        <SummaryStat label="Outstanding" value={`$${totalOutstanding.toLocaleString()}`} />
        <SummaryStat label="Overdue" value={`${overdueCount}`} />
      </div>

      <Card
        title={`Vendor / Contractor Invoices (${invoices.length})`}
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >
            <Plus size={14} /> Add Invoice
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vendor">
                <input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Invoice #">
                <input value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Amount">
                <input type="number" min={0} value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} className={inputCls} />
              </Field>
              <Field label="Invoice date">
                <input type="date" value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Due date">
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputCls}>
                  {["PENDING", "PAID", "OVERDUE", "DISPUTED"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Notes">
                <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save Invoice"}</PrimaryButton>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 font-medium">Vendor</th>
              <th className="py-2 font-medium">Invoice #</th>
              <th className="py-2 font-medium text-right">Amount</th>
              <th className="py-2 font-medium">Invoice date</th>
              <th className="py-2 font-medium">Due date</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="py-2.5 font-medium text-slate-800">
                  {inv.vendor}
                  {inv.notes && <p className="text-xs text-slate-400 font-normal">{inv.notes}</p>}
                </td>
                <td className="py-2.5 text-slate-600">{inv.invoiceNumber ?? "—"}</td>
                <td className="py-2.5 text-right text-slate-700">${inv.amount.toLocaleString()}</td>
                <td className="py-2.5 text-slate-600">{formatDate(inv.invoiceDate)}</td>
                <td className="py-2.5 text-slate-600">{formatDate(inv.dueDate)}</td>
                <td className="py-2.5">
                  <select
                    value={inv.status}
                    onChange={(e) => updateStatus(inv.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                  >
                    {["PENDING", "PAID", "OVERDUE", "DISPUTED"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div className="mt-1"><StatusPill status={inv.status} /></div>
                </td>
                <td className="py-2.5 text-right">
                  <button onClick={() => remove(inv.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">No invoices logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 text-center bg-white">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
