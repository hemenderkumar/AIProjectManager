"use client";
import { useState } from "react";

const inputCls =
  "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function RespondForm({ token }: { token: string }) {
  const [responseText, setResponseText] = useState("");
  const [proposedCost, setProposedCost] = useState("");
  const [proposedTimelineWeeks, setProposedTimelineWeeks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(decline = false) {
    if (!decline && !responseText.trim()) {
      setError("Describe your proposed solution before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/rfp-respond/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          decline
            ? { decline: true }
            : {
                responseText,
                proposedCost: proposedCost === "" ? null : Number(proposedCost),
                proposedTimelineWeeks: proposedTimelineWeeks === "" ? null : Number(proposedTimelineWeeks),
              }
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Couldn't submit — try again.");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return <p className="text-sm text-emerald-700">Thanks — your response has been submitted.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">Your proposed solution *</label>
        <textarea
          value={responseText}
          onChange={(e) => setResponseText(e.target.value)}
          rows={8}
          className={inputCls}
          placeholder="Describe your approach, relevant experience, and why you're a good fit..."
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Proposed cost ($)</label>
          <input type="number" value={proposedCost} onChange={(e) => setProposedCost(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Proposed timeline (weeks)</label>
          <input type="number" value={proposedTimelineWeeks} onChange={(e) => setProposedTimelineWeeks(e.target.value)} className={inputCls} />
        </div>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={() => submit(false)}
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Proposal"}
        </button>
        <button
          onClick={() => submit(true)}
          disabled={submitting}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          I&apos;m not able to respond to this RFP
        </button>
      </div>
    </div>
  );
}
