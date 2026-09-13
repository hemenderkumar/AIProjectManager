"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import type { SessionUser } from "@/lib/auth";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateTime } from "@/lib/format";
import { Lock, Plus, Check, X, History, Download } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// Locking a fresh baseline (PM+) and proposing a change against the active one (CONTRIBUTOR+)
// are both real actions -- approving/rejecting a change is a separate, higher-tier one
// (SUPER_USER+, same tier that approves a SOW). See the comments on the three API routes this
// tab talks to for the full reasoning behind why baselines are append-only and never edited.
export default function BudgetTab({ detail, user }: { detail: ProjectDetail; user?: SessionUser | null }) {
  const router = useRouter();
  const projectId = detail.project.id;
  const canLockBaseline = user?.role === "PM" || user?.role === "SUPER_USER" || user?.role === "ADMIN";
  const canPropose = !!user && user.role !== "VIEWER";
  const canDecide = user?.role === "SUPER_USER" || user?.role === "ADMIN";

  const baselines = detail.budgetBaselines ?? [];
  const changeRequests = detail.budgetChangeRequests ?? [];
  const activeBaseline = baselines.find((b) => b.isActive) ?? null;
  const pendingRequests = changeRequests.filter((cr) => cr.status === "PENDING");
  const approvedDelta = changeRequests
    .filter((cr) => cr.status === "APPROVED")
    .reduce((s, cr) => s + cr.amountDelta, 0);

  const [showLockForm, setShowLockForm] = useState(false);
  const [lockForm, setLockForm] = useState({ totalAmount: "", notes: "" });
  const [lockSaving, setLockSaving] = useState(false);

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState({ title: "", description: "", amountDelta: "" });
  const [requestSaving, setRequestSaving] = useState(false);

  const [decidingId, setDecidingId] = useState<string | null>(null);

  async function lockBaseline() {
    setLockSaving(true);
    await fetch(`/api/projects/${projectId}/budget-baselines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalAmount: lockForm.totalAmount === "" ? undefined : Number(lockForm.totalAmount),
        notes: lockForm.notes || undefined,
      }),
    });
    setLockSaving(false);
    setShowLockForm(false);
    setLockForm({ totalAmount: "", notes: "" });
    router.refresh();
  }

  async function submitRequest() {
    if (!requestForm.title.trim() || !requestForm.amountDelta) return;
    setRequestSaving(true);
    await fetch(`/api/projects/${projectId}/budget-change-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: requestForm.title,
        description: requestForm.description || undefined,
        amountDelta: Number(requestForm.amountDelta),
      }),
    });
    setRequestSaving(false);
    setShowRequestForm(false);
    setRequestForm({ title: "", description: "", amountDelta: "" });
    router.refresh();
  }

  async function decide(crId: string, decision: "APPROVED" | "REJECTED") {
    setDecidingId(crId);
    await fetch(`/api/projects/${projectId}/budget-change-requests/${crId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setDecidingId(null);
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex justify-end">
        <a
          href={`/api/projects/${projectId}/accounting-export`}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          title="Downloads a generic ledger CSV -- import it into QuickBooks (Banking > Upload from file) or Xero (Import a statement) and map the columns once."
        >
          <Download size={13} /> Export to Accounting (CSV)
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryStat label="Active baseline" value={activeBaseline ? `$${activeBaseline.totalAmount.toLocaleString()}` : "None locked"} />
        <SummaryStat label="Baseline version" value={activeBaseline ? `v${activeBaseline.versionNumber}` : "—"} />
        <SummaryStat label="Approved changes" value={`${approvedDelta >= 0 ? "+" : ""}$${approvedDelta.toLocaleString()}`} />
        <SummaryStat label="Pending requests" value={`${pendingRequests.length}`} />
      </div>

      <Card
        title="Active Budget Baseline"
        action={
          canLockBaseline && (
            <button
              onClick={() => setShowLockForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
            >
              <Lock size={14} /> {activeBaseline ? "Re-baseline" : "Lock Initial Baseline"}
            </button>
          )
        }
      >
        {showLockForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <p className="text-xs text-slate-500">
              Locks a new, immutable baseline version. Leave the amount blank to use the project&apos;s current planned
              budget. For routine in-flight changes, propose a Change Request below instead -- this is for establishing
              a clean starting point.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Total amount (optional)">
                <input
                  type="number"
                  placeholder={`Defaults to project's planned budget`}
                  value={lockForm.totalAmount}
                  onChange={(e) => setLockForm((f) => ({ ...f, totalAmount: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Notes">
                <input value={lockForm.notes} onChange={(e) => setLockForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <PrimaryButton onClick={lockBaseline} disabled={lockSaving}>{lockSaving ? "Locking..." : "Lock Baseline"}</PrimaryButton>
          </div>
        )}

        {activeBaseline ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="text-2xl font-semibold text-slate-900">${activeBaseline.totalAmount.toLocaleString()}</p>
              <span className="text-xs text-slate-400">v{activeBaseline.versionNumber} · locked by {activeBaseline.lockedBy} on {formatDateTime(activeBaseline.lockedAt)}</span>
            </div>
            {activeBaseline.notes && <p className="text-xs text-slate-500">{activeBaseline.notes}</p>}
            {activeBaseline.breakdownSnapshot && (
              <pre className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap font-sans">{activeBaseline.breakdownSnapshot}</pre>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">No baseline locked yet. {canLockBaseline ? "Lock one to start tracking approved-budget history." : "Ask a PM or approver to lock one."}</p>
        )}
      </Card>

      <Card
        title={`Change Requests (${changeRequests.length})`}
        action={
          canPropose && (
            <button
              onClick={() => setShowRequestForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
            >
              <Plus size={14} /> Propose Change
            </button>
          )
        }
      >
        {showRequestForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <Field label="Title">
              <input value={requestForm.title} onChange={(e) => setRequestForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Amount change ($, negative to decrease)">
                <input
                  type="number"
                  value={requestForm.amountDelta}
                  onChange={(e) => setRequestForm((f) => ({ ...f, amountDelta: e.target.value }))}
                  className={inputCls}
                />
              </Field>
              <Field label="Description (why)">
                <input value={requestForm.description} onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <PrimaryButton onClick={submitRequest} disabled={requestSaving}>{requestSaving ? "Submitting..." : "Submit Request"}</PrimaryButton>
          </div>
        )}

        <div className="space-y-2">
          {changeRequests.map((cr) => (
            <div key={cr.id} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{cr.title}</p>
                  {cr.description && <p className="text-xs text-slate-500 mt-0.5">{cr.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    Requested by {cr.requestedBy} on {formatDateTime(cr.requestedAt)}
                    {cr.decidedBy && ` · Decided by ${cr.decidedBy} on ${formatDateTime(cr.decidedAt)}`}
                  </p>
                  {cr.decisionNotes && <p className="text-xs text-slate-400 italic mt-0.5">&quot;{cr.decisionNotes}&quot;</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-sm font-semibold ${cr.amountDelta >= 0 ? "text-amber-600" : "text-emerald-600"}`}>
                    {cr.amountDelta >= 0 ? "+" : ""}${cr.amountDelta.toLocaleString()}
                  </span>
                  <StatusPill status={cr.status} />
                </div>
              </div>
              {cr.status === "PENDING" && canDecide && (
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-50">
                  <button
                    onClick={() => decide(cr.id, "APPROVED")}
                    disabled={decidingId === cr.id}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Check size={13} /> Approve
                  </button>
                  <button
                    onClick={() => decide(cr.id, "REJECTED")}
                    disabled={decidingId === cr.id}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    <X size={13} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
          {changeRequests.length === 0 && <p className="text-sm text-center text-slate-400 py-6">No budget change requests yet.</p>}
        </div>
      </Card>

      {baselines.length > 1 && (
        <Card title="Baseline History">
          <div className="space-y-2">
            {baselines.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2 text-slate-500">
                  <History size={12} />
                  <span className="font-medium text-slate-700">v{b.versionNumber}</span>
                  <span>{formatDateTime(b.lockedAt)}</span>
                  {b.isActive && <span className="text-emerald-600 font-medium">Active</span>}
                </div>
                <span className="text-slate-700 font-medium">${b.totalAmount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 text-center bg-white">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
