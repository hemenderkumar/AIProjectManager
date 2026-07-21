"use client";
import { useState } from "react";
import { Sparkles, Loader2, Check, X, MessageSquarePlus } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

export type AiEditEntityType = "sow" | "deliverable" | "risk" | "task" | "solutionOption" | "project" | "scOrganization" | "scProject";

type Proposal = {
  changes: Record<string, string | number | boolean | null>;
  explanation: string;
  patchUrl: string;
  fieldLabels: Record<string, string>;
  current: Record<string, unknown>;
};

// Drop-in "edit this via AI chat" widget for any record covered by src/lib/aiEditEntities.ts —
// so wherever the app (or a person) created something, revising it doesn't require hunting
// down the right field to hand-edit. Proposes a field diff first (POST /api/ai/edit-entity,
// writes nothing), the user reviews before/after per field, then Apply PATCHes the entity's own
// real endpoint — same permission checks and side effects as editing the field by hand.
export default function AiEditChat({
  entityType,
  entityId,
  onApplied,
  placeholder = "e.g. \"make the timeline 3 months instead of 2\"",
}: {
  entityType: AiEditEntityType;
  entityId: string;
  onApplied?: (changes: Record<string, unknown>) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [proposing, setProposing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  async function propose() {
    if (!instruction.trim()) return;
    setProposing(true);
    setError(null);
    setProposal(null);
    try {
      const res = await fetch("/api/ai/edit-entity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, instruction }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't propose an edit right now.");
        return;
      }
      setProposal(data);
    } finally {
      setProposing(false);
    }
  }

  async function apply() {
    if (!proposal || Object.keys(proposal.changes).length === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(proposal.patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proposal.changes),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Couldn't apply that change.");
        return;
      }
      onApplied?.(proposal.changes);
      setProposal(null);
      setInstruction("");
      setOpen(false);
    } finally {
      setApplying(false);
    }
  }

  function discard() {
    setProposal(null);
    setInstruction("");
    setError(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-accent-600 hover:text-accent-700"
      >
        <MessageSquarePlus size={13} /> Edit with AI
      </button>
    );
  }

  const changeEntries = proposal ? Object.entries(proposal.changes) : [];

  return (
    <div className="border border-accent-100 bg-accent-50/40 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-accent-700 flex items-center gap-1">
          <Sparkles size={12} /> Edit with AI
        </p>
        <button onClick={() => { setOpen(false); discard(); }} className="text-slate-400 hover:text-slate-600">
          <X size={13} />
        </button>
      </div>

      {!proposal && (
        <div className="flex items-center gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !proposing) propose(); }}
            placeholder={placeholder}
            className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500"
            disabled={proposing}
          />
          <button
            onClick={propose}
            disabled={proposing || !instruction.trim()}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white disabled:opacity-50 font-medium shrink-0"
          >
            {proposing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {proposing ? "Thinking..." : "Propose"}
          </button>
        </div>
      )}

      <AiWaitIndicator active={proposing} messages={["Reading the current values...", "Working out what to change..."]} />
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {proposal && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">{proposal.explanation}</p>
          {changeEntries.length > 0 ? (
            <div className="space-y-1.5">
              {changeEntries.map(([key, value]) => (
                <div key={key} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2">
                  <p className="font-medium text-slate-700 mb-0.5">{proposal.fieldLabels[key] ?? key}</p>
                  <p className="text-slate-400 line-through decoration-slate-300">
                    {String(proposal.current[key] ?? "(empty)")}
                  </p>
                  <p className="text-emerald-700">{String(value ?? "(empty)")}</p>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={apply}
                  disabled={applying}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white disabled:opacity-50 font-medium"
                >
                  {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {applying ? "Applying..." : "Apply"}
                </button>
                <button onClick={discard} disabled={applying} className="text-xs text-slate-500 hover:text-slate-700">
                  Discard
                </button>
              </div>
            </div>
          ) : (
            <button onClick={discard} className="text-xs text-slate-500 hover:text-slate-700">
              Try a different instruction
            </button>
          )}
        </div>
      )}
    </div>
  );
}
