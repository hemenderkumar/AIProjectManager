"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { PriorityBadge } from "@/components/badges";
import { formatDate } from "@/lib/format";
import { Plus, Sparkles, Loader2, Trash2, X } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";

type Incident = {
  id: string;
  projectId: string | null;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  reportedBy: string | null;
  assignee: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  aiRecommendation: string | null;
};

type ProjectOption = { id: string; name: string };

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-rose-50 text-rose-700",
  IN_PROGRESS: "bg-sky-50 text-sky-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-600",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export default function IncidentsBoard({ incidents, projects }: { incidents: Incident[]; projects: ProjectOption[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    projectId: "",
    severity: "MEDIUM",
    reportedBy: "",
    assignee: "",
  });
  const [recommending, setRecommending] = useState<string | null>(null);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;

  async function draftWithAI() {
    if (!draftNote.trim()) return;
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch("/api/ai/draft-incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draftNote, projectId: form.projectId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraftError(data?.error ?? "Couldn't draft this incident.");
        return;
      }
      setForm((f) => ({ ...f, title: data.title ?? f.title, description: data.description ?? f.description, severity: data.severity ?? f.severity }));
    } finally {
      setDrafting(false);
    }
  }

  async function submit() {
    if (!form.title.trim()) return;
    setSaving(true);
    await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, projectId: form.projectId || null }),
    });
    setSaving(false);
    setShowForm(false);
    setForm({ title: "", description: "", projectId: "", severity: "MEDIUM", reportedBy: "", assignee: "" });
    router.refresh();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function saveResolution(id: string) {
    await fetch(`/api/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionNotes: resolutionDraft }),
    });
    router.refresh();
  }

  async function getRecommendation(id: string) {
    setRecommending(id);
    try {
      await fetch("/api/ai/incident-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: id }),
      });
      router.refresh();
    } finally {
      setRecommending(null);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/incidents/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const open = incidents.filter((i) => i.status !== "CLOSED" && i.status !== "RESOLVED").length;
  const critical = incidents.filter((i) => i.severity === "CRITICAL" && i.status !== "CLOSED").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Total Incidents" value={String(incidents.length)} />
        <StatCard label="Open / In Progress" value={String(open)} tone={open > 0 ? "warn" : "good"} />
        <StatCard label="Critical (unresolved)" value={String(critical)} tone={critical > 0 ? "bad" : "good"} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-900">Incidents ({incidents.length})</p>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
          >
            <Plus size={14} /> New Incident
          </button>
        </div>

        {showForm && (
          <div className="p-4 bg-slate-50 border-b border-slate-100 space-y-3">
            <div className="border border-accent-100 bg-accent-50/60 rounded-lg p-3 space-y-2">
              <FormField label="Describe what happened (rough notes are fine) — AI drafts the fields below">
                <textarea
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  className={fieldCls}
                  rows={2}
                  placeholder="e.g. checkout was timing out for a bunch of users around 2pm, seemed tied to the payment API"
                />
              </FormField>
              <button
                onClick={draftWithAI}
                disabled={drafting || !draftNote.trim()}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 disabled:opacity-50 font-medium"
              >
                {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {drafting ? "Drafting..." : "Draft with AI"}
              </button>
              <AiWaitIndicator active={drafting} messages={["Reading your note...", "Judging severity..."]} />
              {draftError && <p className="text-xs text-rose-600">{draftError}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Title">
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={fieldCls} />
              </FormField>
              <FormField label="Linked Project (optional)">
                <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} className={fieldCls}>
                  <option value="">Not linked to a specific project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Description">
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={fieldCls} rows={2} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <FormField label="Severity">
                <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))} className={fieldCls}>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Reported by">
                <input value={form.reportedBy} onChange={(e) => setForm((f) => ({ ...f, reportedBy: e.target.value }))} className={fieldCls} />
              </FormField>
              <FormField label="Assignee">
                <input value={form.assignee} onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))} className={fieldCls} />
              </FormField>
            </div>
            <button
              onClick={submit}
              disabled={saving}
              className="text-xs px-3 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 disabled:opacity-50 font-medium"
            >
              {saving ? "Saving..." : "Log Incident"}
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-2.5 font-medium">Incident</th>
              <th className="px-4 py-2.5 font-medium">Project</th>
              <th className="px-4 py-2.5 font-medium">Severity</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Assignee</th>
              <th className="px-4 py-2.5 font-medium">Reported</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc) => (
              <Fragment key={inc.id}>
                <tr className="border-b border-slate-50 last:border-0 align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        setOpenIncidentId((prev) => (prev === inc.id ? null : inc.id));
                        setResolutionDraft(inc.resolutionNotes ?? "");
                      }}
                      className="font-medium text-slate-800 hover:text-accent-600 text-left"
                    >
                      {inc.title}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{projectName(inc.projectId) ?? "—"}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={inc.severity} /></td>
                  <td className="px-4 py-3">
                    <select
                      value={inc.status}
                      onChange={(e) => updateStatus(inc.id, e.target.value)}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                    >
                      {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                    <div className="mt-1"><StatusPill status={inc.status} /></div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{inc.assignee ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(inc.reportedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(inc.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
                {openIncidentId === inc.id && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-xs text-slate-600 max-w-2xl">{inc.description || "No description provided."}</p>
                        <button onClick={() => setOpenIncidentId(null)} className="text-slate-400 hover:text-slate-600">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => getRecommendation(inc.id)}
                          disabled={recommending === inc.id}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
                        >
                          {recommending === inc.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          Get AI Recommendation
                        </button>
                      </div>
                      {inc.aiRecommendation && (
                        <div className="border border-accent-200 bg-accent-50/60 rounded-lg p-3 mb-2 whitespace-pre-wrap text-xs text-accent-900">
                          {inc.aiRecommendation}
                        </div>
                      )}
                      <FormField label="Resolution notes">
                        <textarea
                          value={resolutionDraft}
                          onChange={(e) => setResolutionDraft(e.target.value)}
                          className={fieldCls}
                          rows={2}
                        />
                      </FormField>
                      <button
                        onClick={() => saveResolution(inc.id)}
                        className="mt-2 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                      >
                        Save resolution notes
                      </button>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {incidents.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No incidents logged. Everything&apos;s quiet.</td></tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const fieldCls = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500";

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "warn" | "bad" }) {
  const toneClasses: Record<string, string> = {
    default: "text-slate-900",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}
