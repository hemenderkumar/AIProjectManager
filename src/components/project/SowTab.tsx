"use client";
import { useEffect, useState } from "react";
import type { ProjectDetail } from "./ProjectTabs";
import type { SessionUser } from "@/lib/auth";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { Plus, Sparkles, Loader2, ChevronDown, ChevronUp, Trash2, FileText } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

type Sow = {
  id: string;
  title: string;
  vendorName: string;
  vendorContactName: string | null;
  vendorContactEmail: string | null;
  status: string;
  scope: string | null;
  deliverablesSummary: string | null;
  timeline: string | null;
  fundingAmount: number | null;
  fundingTerms: string | null;
  risks: string | null;
  issues: string | null;
  content: string | null;
  createdBy: string | null;
  createdAt: string;
};

const STATUSES = ["DRAFT", "PENDING_SIGNATURE", "SIGNED", "ACTIVE", "COMPLETED", "TERMINATED"];

const emptyForm = {
  title: "", vendorName: "", vendorContactName: "", vendorContactEmail: "",
  scope: "", deliverablesSummary: "", timeline: "", fundingAmount: "", fundingTerms: "",
  risks: "", issues: "", content: "",
};

export default function SowTab({ detail, user }: { detail: ProjectDetail; user?: SessionUser | null }) {
  const canManage = user?.role === "SUPER_USER" || user?.role === "ADMIN";
  const projectId = detail.project.id;

  const [sows, setSows] = useState<Sow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [milestones, setMilestones] = useState<{ name: string; dueDate: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/sows`);
    const data = await res.json().catch(() => []);
    setSows(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function draftWithAI() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/ai/draft-sow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraftError(data?.error ?? "Couldn't draft this SOW.");
        return;
      }
      setForm({
        title: data.title ?? "",
        vendorName: data.vendorName ?? "",
        vendorContactName: data.vendorContactName ?? "",
        vendorContactEmail: data.vendorContactEmail ?? "",
        scope: data.scope ?? "",
        deliverablesSummary: data.deliverablesSummary ?? "",
        timeline: data.timeline ?? "",
        fundingAmount: data.fundingAmount != null ? String(data.fundingAmount) : "",
        fundingTerms: data.fundingTerms ?? "",
        risks: data.risks ?? "",
        issues: data.issues ?? "",
        content: data.content ?? "",
      });
      setMilestones(Array.isArray(data.milestones) ? data.milestones : []);
    } finally {
      setDrafting(false);
    }
  }

  async function submit() {
    if (!form.title.trim() || !form.vendorName.trim()) return;
    setSaving(true);
    setSaveError(null);
    const res = await fetch(`/api/projects/${projectId}/sows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, createdByAi: milestones.length > 0 || !!form.content, milestones }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(data?.error ?? "Could not create the SOW.");
      return;
    }
    setShowForm(false);
    setForm(emptyForm);
    setMilestones([]);
    load();
  }

  async function updateStatus(id: string, status: string) {
    setSows((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    await fetch(`/api/sows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this SOW? This cannot be undone.")) return;
    await fetch(`/api/sows/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card
        title={`Statements of Work (${sows.length})`}
        action={
          canManage ? (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            >
              <Plus size={14} /> New SOW
            </button>
          ) : undefined
        }
      >
        <p className="text-xs text-slate-400 mb-3">
          The formal contract between your company and a vendor for this project — scope, deliverables,
          timeline, funding, risks, and issues. Only a company owner (or Keel admin) can create or edit one.
        </p>

        {showForm && canManage && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="border border-indigo-100 bg-indigo-50/60 rounded-lg p-3 space-y-2">
              <p className="text-xs text-indigo-700">
                Draft the whole SOW from this project&apos;s charter and plan, then review/edit everything below before saving.
              </p>
              <button
                onClick={draftWithAI}
                disabled={drafting}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {drafting ? "Drafting..." : "Draft with AI"}
              </button>
              <AiWaitIndicator active={drafting} messages={["Reading the charter and plan...", "Drafting scope, timeline, and funding...", "Writing the full SOW document..."]} />
              {draftError && <p className="text-xs text-rose-600">{draftError}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="SOW title">
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Vendor name">
                <input value={form.vendorName} onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Vendor contact name">
                <input value={form.vendorContactName} onChange={(e) => setForm((f) => ({ ...f, vendorContactName: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Vendor contact email">
                <input value={form.vendorContactEmail} onChange={(e) => setForm((f) => ({ ...f, vendorContactEmail: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <Field label="Scope">
              <textarea value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Deliverables summary">
              <textarea value={form.deliverablesSummary} onChange={(e) => setForm((f) => ({ ...f, deliverablesSummary: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Timeline">
              <textarea value={form.timeline} onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Funding amount ($)">
                <input type="number" min={0} value={form.fundingAmount} onChange={(e) => setForm((f) => ({ ...f, fundingAmount: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Funding terms">
                <input value={form.fundingTerms} onChange={(e) => setForm((f) => ({ ...f, fundingTerms: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <Field label="Risks">
              <textarea value={form.risks} onChange={(e) => setForm((f) => ({ ...f, risks: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Issues">
              <textarea value={form.issues} onChange={(e) => setForm((f) => ({ ...f, issues: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            {milestones.length > 0 && (
              <Field label="Suggested milestones (created alongside the SOW)">
                <div className="space-y-1">
                  {milestones.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                      <span className="font-medium">{m.name}</span>
                      <span className="text-slate-400">{new Date(m.dueDate).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Full SOW document">
              <textarea value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} className={inputCls} rows={8} />
            </Field>
            {saveError && <p className="text-xs text-rose-600">{saveError}</p>}
            <div className="flex items-center gap-2">
              <PrimaryButton onClick={submit} disabled={saving || !form.title.trim() || !form.vendorName.trim()}>
                {saving ? "Saving..." : "Save SOW"}
              </PrimaryButton>
              <button onClick={() => setShowForm(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {sows.map((s) => (
            <div key={s.id} className="border border-slate-100 rounded-lg">
              <div className="flex items-center justify-between px-3 py-2.5">
                <button onClick={() => setExpandedId(expandedId === s.id ? null : s.id)} className="flex items-center gap-2 text-left flex-1 min-w-0">
                  {expandedId === s.id ? <ChevronUp size={14} className="text-slate-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.title}</p>
                    <p className="text-xs text-slate-400">{s.vendorName}{s.fundingAmount != null ? ` · $${s.fundingAmount.toLocaleString()}` : ""}</p>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  {canManage ? (
                    <select
                      value={s.status}
                      onChange={(e) => updateStatus(s.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      {STATUSES.map((st) => <option key={st} value={st}>{st.replace("_", " ")}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-500 bg-slate-50 rounded-full px-2 py-0.5">{s.status.replace("_", " ")}</span>
                  )}
                  {canManage && (
                    <button onClick={() => remove(s.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              {expandedId === s.id && (
                <div className="border-t border-slate-100 px-3 py-3 space-y-2 text-xs text-slate-600">
                  {s.scope && <p><span className="font-medium text-slate-700">Scope: </span>{s.scope}</p>}
                  {s.deliverablesSummary && <p><span className="font-medium text-slate-700">Deliverables: </span>{s.deliverablesSummary}</p>}
                  {s.timeline && <p><span className="font-medium text-slate-700">Timeline: </span>{s.timeline}</p>}
                  {s.fundingTerms && <p><span className="font-medium text-slate-700">Funding terms: </span>{s.fundingTerms}</p>}
                  {s.risks && <p><span className="font-medium text-slate-700">Risks: </span>{s.risks}</p>}
                  {s.issues && <p><span className="font-medium text-slate-700">Issues: </span>{s.issues}</p>}
                  {s.content && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <p className="font-medium text-slate-700 mb-1 flex items-center gap-1"><FileText size={12} /> Full document</p>
                      <pre className="whitespace-pre-wrap font-sans text-slate-600 bg-slate-50 rounded-lg p-3">{s.content}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {!loading && sows.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">
              No SOWs yet. {canManage ? "Create one above once the charter and plan are ready." : "Your company owner or admin hasn't created one yet."}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
