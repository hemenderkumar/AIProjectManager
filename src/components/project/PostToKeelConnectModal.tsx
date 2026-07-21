"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Sparkles, Loader2, Globe2 } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

type ClientOrg = { id: string; name: string; orgType: "CLIENT" | "VENDOR" };

type Task = {
  id: string;
  title: string;
  description: string | null;
  estimateHours?: number | null;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

// Bridges a Keel Deliver task the AI PM (or a person) tagged executionSource "VENDOR" into
// a real KeelConnect marketplace posting -- see /api/projects/[id]/tasks/[taskId]/post-to-keelconnect.
// Reuses KeelConnect's own "Draft with AI" endpoint (not Deliver's) so the posting reads as a
// proper external-facing brief rather than a copy-pasted internal task description.
export default function PostToKeelConnectModal({
  projectId,
  task,
  onClose,
  onPosted,
}: {
  projectId: string;
  task: Task;
  onClose: () => void;
  onPosted: (scProjectId: string) => void;
}) {
  const [clientOrgs, setClientOrgs] = useState<ClientOrg[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);
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

  useEffect(() => {
    async function load() {
      setLoadingOrgs(true);
      const res = await fetch("/api/keelconnect/organizations");
      if (res.ok) {
        const orgs: ClientOrg[] = await res.json();
        const clients = orgs.filter((o) => o.orgType === "CLIENT");
        setClientOrgs(clients);
        if (clients.length === 1) setForm((f) => ({ ...f, clientOrgId: clients[0].id }));
      }
      setLoadingOrgs(false);
    }
    load();
  }, []);

  async function draftWithAI() {
    setDrafting(true);
    setError(null);
    try {
      const note = `Task: ${task.title}\n${task.description ?? ""}${
        task.estimateHours ? `\nInternal effort estimate: ~${task.estimateHours} hours` : ""
      }`.trim();
      const res = await fetch("/api/ai/draft-keelconnect-project", {
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
    if (!form.clientOrgId || !form.title.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}/post-to-keelconnect`, {
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
            <Globe2 size={16} className="text-slate-400" /> Post to KeelConnect
          </p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Turns this task into a marketplace posting for vetted Vendor organizations to bid on.
          It&apos;s saved as a draft in KeelConnect — nothing is visible to Vendors until you post it there.
        </p>

        {loadingOrgs ? (
          <p className="text-xs text-slate-400 py-4">Loading your KeelConnect organizations...</p>
        ) : clientOrgs.length === 0 ? (
          <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
            You don&apos;t have a Client organization on KeelConnect yet.{" "}
            <Link href="/keelconnect/organizations" className="text-accent-600 font-medium hover:text-accent-700">
              Register one
            </Link>{" "}
            first, then come back and post this task.
          </div>
        ) : (
          <>
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

            <select value={form.clientOrgId} onChange={(e) => setForm((f) => ({ ...f, clientOrgId: e.target.value }))} className={inputCls}>
              <option value="">Posting as...</option>
              {clientOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
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
                <option value="MEDIATOR">Mediator (Keel contracts both sides)</option>
              </select>
              <select value={form.locationRequirement} onChange={(e) => setForm((f) => ({ ...f, locationRequirement: e.target.value }))} className={inputCls}>
                <option value="GLOBAL">Global</option>
                <option value="RESTRICTED">Restricted</option>
              </select>
            </div>

            {error && <p className="text-xs text-rose-600">{error}</p>}
            <button
              onClick={post}
              disabled={posting || !form.clientOrgId || !form.title.trim()}
              className="w-full px-3.5 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors text-sm font-medium hover:bg-accent-700 disabled:opacity-50"
            >
              {posting ? "Saving..." : "Save as draft in KeelConnect"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
