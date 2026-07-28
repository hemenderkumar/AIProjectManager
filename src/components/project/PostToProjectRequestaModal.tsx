"use client";
import { useState } from "react";
import { X, Sparkles, Loader2, Globe2 } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

type Task = {
  id: string;
  title: string;
  description: string | null;
  estimateHours?: number | null;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

// Bridges a Executa task the AI PM (or a person) tagged executionSource "VENDOR" into
// a real ProjectRequesta marketplace posting -- see /api/projects/[id]/tasks/[taskId]/post-to-projectrequesta,
// which now makes an authenticated HTTP call to ProjectRequesta's own /api/bridge/post-project
// endpoint rather than a same-database insert (the two apps have separate databases as of the
// split). Because of that, we can no longer look up "your ProjectRequesta Client organizations"
// here -- Executa has no visibility into ProjectRequesta's org table -- so the Client Org ID is a
// plain text field the poster fills in by hand (found on the Organization page in ProjectRequesta
// itself). The receiving endpoint validates that the id is a real CLIENT org; this form can't.
export default function PostToProjectRequestaModal({
  projectId,
  task,
  onClose,
  onPosted,
}: {
  projectId: string;
  task: Task;
  onClose: () => void;
  onPosted: (prProjectId: string) => void;
}) {
  const [form, setForm] = useState({
    clientOrgId: "",
    title: task.title,
    description: task.description ?? "",
    category: "",
    targetBudget: "",
    currency: "USD",
    engagementModel: "MARKETPLACE",
    locationRequirement: "GLOBAL",
  });
  const [drafting, setDrafting] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draftWithAI() {
    setDrafting(true);
    setError(null);
    try {
      const note = `Task: ${task.title}\n${task.description ?? ""}${
        task.estimateHours ? `\nInternal effort estimate: ~${task.estimateHours} hours` : ""
      }`.trim();
      const res = await fetch("/api/ai/draft-projectrequesta-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't draft this posting right now.");
        return;
      }
      setForm((f) => ({
        ...f,
        title: data.title ?? f.title,
        description: data.description ?? f.description,
        category: data.category ?? f.category,
        targetBudget: typeof data.targetBudget === "number" && data.targetBudget > 0 ? String(data.targetBudget) : f.targetBudget,
        currency: data.currency ?? f.currency,
        engagementModel: data.engagementModel === "MEDIATOR" ? "MEDIATOR" : "MARKETPLACE",
        locationRequirement: data.locationRequirement === "RESTRICTED" ? "RESTRICTED" : "GLOBAL",
      }));
    } finally {
      setDrafting(false);
    }
  }

  async function post() {
    if (!form.clientOrgId.trim() || !form.title.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}/post-to-projectrequesta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, targetBudget: form.targetBudget ? Number(form.targetBudget) : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Could not post this project.");
        return;
      }
      onPosted(data.id);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Globe2 size={16} className="text-slate-400" /> Post to ProjectRequesta
          </p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Turns this task into a marketplace posting for vetted Vendor organizations to bid on.
          It&apos;s saved as a draft in ProjectRequesta — nothing is visible to Vendors until you post it there.
        </p>

        <div className="border border-accent-100 bg-accent-50/60 rounded-lg p-3 space-y-2">
          <button
            onClick={draftWithAI}
            disabled={drafting}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 disabled:opacity-50 font-medium"
          >
            {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {drafting ? "Drafting..." : "Draft an external-facing posting with AI"}
          </button>
          <AiWaitIndicator active={drafting} messages={["Reading the task...", "Writing it up for vendors..."]} />
        </div>

        <div>
          <input
            placeholder="ProjectRequesta Client Org ID"
            value={form.clientOrgId}
            onChange={(e) => setForm((f) => ({ ...f, clientOrgId: e.target.value }))}
            className={inputCls}
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Find this on your Organization page in ProjectRequesta — Executa can&apos;t look it up directly since the two apps now have separate databases.
          </p>
        </div>
        <input placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={`${inputCls} min-h-20`}
        />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={inputCls} />
          <div className="flex gap-2">
            <input placeholder="Budget" type="number" value={form.targetBudget} onChange={(e) => setForm((f) => ({ ...f, targetBudget: e.target.value }))} className={inputCls} />
            <input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className={`${inputCls} w-20 shrink-0`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={form.engagementModel} onChange={(e) => setForm((f) => ({ ...f, engagementModel: e.target.value }))} className={inputCls}>
            <option value="MARKETPLACE">Marketplace</option>
            <option value="MEDIATOR">Mediator (Executa contracts both sides)</option>
          </select>
          <select value={form.locationRequirement} onChange={(e) => setForm((f) => ({ ...f, locationRequirement: e.target.value }))} className={inputCls}>
            <option value="GLOBAL">Global</option>
            <option value="RESTRICTED">Restricted</option>
          </select>
        </div>

        {error && <p className="text-xs text-rose-600">{error}</p>}
        <button
          onClick={post}
          disabled={posting || !form.clientOrgId.trim() || !form.title.trim()}
          className="w-full px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
        >
          {posting ? "Saving..." : "Save as draft in ProjectRequesta"}
        </button>
      </div>
    </div>
  );
}
