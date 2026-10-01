"use client";
import { useState } from "react";

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function DecisionForm({ token }: { token: string }) {
  const [decided, setDecided] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [saving, setSaving] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "APPROVED" | "REJECTED") {
    setSaving(decision);
    setError(null);
    const res = await fetch(`/api/sponsor-approval/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, decisionNote }),
    });
    setSaving(null);
    if (res.ok) {
      setDecided(decision);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Something went wrong recording your decision.");
    }
  }

  if (decided) {
    return (
      <p className={`text-sm ${decided === "APPROVED" ? "text-emerald-600" : "text-rose-600"}`}>
        {decided === "APPROVED" ? "Thanks — your approval has been recorded." : "Thanks — your decision has been recorded."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
        <textarea
          value={decisionNote}
          onChange={(e) => setDecisionNote(e.target.value)}
          className={inputCls}
          rows={3}
          placeholder="Any context for your decision..."
        />
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => decide("APPROVED")}
          disabled={!!saving}
          className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white shadow-sm shadow-emerald-600/20 transition-colors text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving === "APPROVED" ? "Approving..." : "Approve"}
        </button>
        <button
          onClick={() => decide("REJECTED")}
          disabled={!!saving}
          className="flex-1 px-4 py-2 rounded-lg bg-white text-rose-600 border border-rose-200 transition-colors text-sm font-medium hover:bg-rose-50 disabled:opacity-50"
        >
          {saving === "REJECTED" ? "Declining..." : "Decline"}
        </button>
      </div>
    </div>
  );
}
