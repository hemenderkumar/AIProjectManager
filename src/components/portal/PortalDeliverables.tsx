"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, ChevronDown, ChevronUp, CheckCircle2, MessageSquareWarning } from "lucide-react";
import DeliverableThread from "@/components/DeliverableThread";

export type PortalDeliverable = {
  id: string;
  title: string;
  projectName: string;
  status: string;
  phase: string | null;
  executiveSummary: string | null;
  approvedBy: string | null;
};

const STYLES: Record<string, string> = {
  IN_REVIEW: "bg-amber-50 text-amber-700",
  CHANGES_REQUESTED: "bg-rose-50 text-rose-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  FINAL: "bg-emerald-50 text-emerald-700",
};

const LABELS: Record<string, string> = {
  IN_REVIEW: "Awaiting your review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  FINAL: "Final",
};

export default function PortalDeliverables({ items, canDecide }: { items: PortalDeliverable[]; canDecide: boolean }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadKey, setThreadKey] = useState(0);

  function decide(id: string, decision: "APPROVE" | "REQUEST_CHANGES") {
    setBusy(true);
    setError(null);
    fetch(`/api/deliverables/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Could not save your decision");
        }
        setNote("");
        setThreadKey((k) => k + 1);
        router.refresh();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }

  const waiting = items.filter((d) => d.status === "IN_REVIEW").length;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <FileCheck2 size={15} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Deliverables</p>
        {waiting > 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
            {waiting} need your review
          </span>
        )}
      </div>
      <div className="divide-y divide-slate-50">
        {items.length === 0 && <p className="text-sm text-slate-400 p-4">No deliverables awaiting review yet.</p>}
        {items.map((d) => {
          const open = openId === d.id;
          return (
            <div key={d.id}>
              <button
                onClick={() => {
                  setOpenId(open ? null : d.id);
                  setNote("");
                  setError(null);
                }}
                className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 truncate">{d.title}</p>
                  <p className="text-xs text-slate-400">
                    {d.projectName}
                    {d.phase ? ` · ${d.phase}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STYLES[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {LABELS[d.status] ?? d.status}
                  </span>
                  {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </button>

              {open && (
                <div className="px-4 pb-4 space-y-3 bg-slate-50/40">
                  {d.executiveSummary && <p className="text-sm text-slate-600 whitespace-pre-wrap">{d.executiveSummary}</p>}
                  {d.approvedBy && (
                    <p className="text-xs flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 size={12} /> Approved by {d.approvedBy}
                    </p>
                  )}

                  {d.status === "IN_REVIEW" && canDecide && (
                    <div className="border border-slate-200 rounded-lg bg-white p-3 space-y-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder="Add a note (required if you're requesting changes)"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={busy}
                          onClick={() => decide(d.id, "APPROVE")}
                          className="inline-flex items-center gap-1.5 text-xs bg-emerald-600 text-white rounded-md px-3 py-1.5 disabled:opacity-50"
                        >
                          <CheckCircle2 size={12} /> Approve
                        </button>
                        <button
                          disabled={busy || !note.trim()}
                          onClick={() => decide(d.id, "REQUEST_CHANGES")}
                          className="inline-flex items-center gap-1.5 text-xs border border-rose-200 text-rose-700 rounded-md px-3 py-1.5 disabled:opacity-50"
                        >
                          <MessageSquareWarning size={12} /> Request changes
                        </button>
                      </div>
                      {error && <p className="text-xs text-rose-600">{error}</p>}
                    </div>
                  )}
                  {d.status === "IN_REVIEW" && !canDecide && (
                    <p className="text-xs text-slate-400">Your role can comment here; a reviewer on your team signs off.</p>
                  )}

                  <DeliverableThread deliverableId={d.id} reloadKey={threadKey} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
