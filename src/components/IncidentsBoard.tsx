"use client";
import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PriorityBadge } from "@/components/badges";
import { formatDate, formatDateTime } from "@/lib/format";
import { computeIncidentSla, averageMttrMinutes, formatMinutes } from "@/lib/incidentSla";
import { Plus, Sparkles, Loader2, Trash2, X, AlertTriangle, Clock, Send, ClipboardList } from "lucide-react";
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
  reportedByUserId: string | null;
  assigneeUserId: string | null;
  reportedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  aiRecommendation: string | null;
  escalatedAt: string | null;
  followUpTaskId: string | null;
};

type IncidentUpdate = { id: string; authorName: string; body: string; createdAt: string };

type ProjectOption = { id: string; name: string };
type UserOption = { id: string; name: string };

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

// SLA badge for a single incident row -- computed client-side from the same pure logic the
// server would use (lib/incidentSla.ts), so "now" is always current rather than stale as of
// the last page load.
function SlaBadge({ incident }: { incident: Incident }) {
  const sla = computeIncidentSla({
    severity: incident.severity,
    status: incident.status,
    reportedAt: new Date(incident.reportedAt),
    acknowledgedAt: incident.acknowledgedAt ? new Date(incident.acknowledgedAt) : null,
    resolvedAt: incident.resolvedAt ? new Date(incident.resolvedAt) : null,
  });
  const isClosed = incident.status === "RESOLVED" || incident.status === "CLOSED";
  if (isClosed) {
    return sla.mttrMinutes != null ? (
      <span className="text-xs text-slate-500">resolved in {formatMinutes(sla.mttrMinutes)}</span>
    ) : null;
  }
  if (sla.resolveBreached) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-rose-50 text-rose-700">
        <AlertTriangle size={11} /> SLA breached
      </span>
    );
  }
  if (sla.ackBreached) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
        <Clock size={11} /> Ack overdue
      </span>
    );
  }
  return <span className="text-xs text-slate-400">on track</span>;
}

export default function IncidentsBoard({ incidents, projects, users }: { incidents: Incident[]; projects: ProjectOption[]; users: UserOption[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    projectId: "",
    severity: "MEDIUM",
    reportedBy: "",
    reportedByUserId: "",
    assignee: "",
    assigneeUserId: "",
  });
  const [recommending, setRecommending] = useState<string | null>(null);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [followingUp, setFollowingUp] = useState<string | null>(null);

  const [updatesById, setUpdatesById] = useState<Record<string, IncidentUpdate[]>>({});
  const [updatesLoading, setUpdatesLoading] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;
  const usersById = new Map(users.map((u) => [u.id, u.name]));
  const personLabel = (userId: string | null, fallback: string | null) =>
    (userId && usersById.get(userId)) || fallback || "—";

  async function checkOk(res: Response, fallback: string) {
    if (res.ok) {
      setActionError(null);
      return true;
    }
    const data = await res.json().catch(() => ({}));
    setActionError(data?.error ?? fallback);
    return false;
  }

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
    const res = await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, projectId: form.projectId || null }),
    });
    setSaving(false);
    if (!(await checkOk(res, "Could not create this incident."))) return;
    setShowForm(false);
    setForm({ title: "", description: "", projectId: "", severity: "MEDIUM", reportedBy: "", reportedByUserId: "", assignee: "", assigneeUserId: "" });
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>, fallback: string) {
    const res = await fetch(`/api/incidents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!(await checkOk(res, fallback))) return;
    router.refresh();
  }

  async function updateStatus(id: string, status: string) {
    await patch(id, { status }, "Could not update this incident's status.");
  }

  async function reassign(id: string, assigneeUserId: string) {
    await patch(id, { assigneeUserId: assigneeUserId || null }, "Could not reassign this incident.");
  }

  async function saveResolution(id: string) {
    await patch(id, { resolutionNotes: resolutionDraft }, "Could not save the resolution notes.");
  }

  async function getRecommendation(id: string) {
    setRecommending(id);
    try {
      const res = await fetch("/api/ai/incident-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: id }),
      });
      if (!(await checkOk(res, "Couldn't generate a recommendation."))) return;
      router.refresh();
    } finally {
      setRecommending(null);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/incidents/${id}`, { method: "DELETE" });
    if (!(await checkOk(res, "Could not delete this incident."))) return;
    router.refresh();
  }

  async function createFollowUp(id: string) {
    setFollowingUp(id);
    try {
      const res = await fetch(`/api/incidents/${id}/follow-up-task`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!(await checkOk(res, "Could not create a follow-up task."))) return;
      router.refresh();
    } finally {
      setFollowingUp(null);
    }
  }

  async function loadUpdates(id: string) {
    setUpdatesLoading(id);
    try {
      const res = await fetch(`/api/incidents/${id}/updates`);
      const data = await res.json().catch(() => []);
      setUpdatesById((prev) => ({ ...prev, [id]: Array.isArray(data) ? data : [] }));
    } finally {
      setUpdatesLoading(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (openIncidentId) loadUpdates(openIncidentId);
  }, [openIncidentId]);

  async function postComment(id: string) {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      const res = await fetch(`/api/incidents/${id}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newComment }),
      });
      if (!(await checkOk(res, "Could not post this update."))) return;
      setNewComment("");
      loadUpdates(id);
    } finally {
      setPostingComment(false);
    }
  }

  const open = incidents.filter((i) => i.status !== "CLOSED" && i.status !== "RESOLVED").length;
  const critical = incidents.filter((i) => i.severity === "CRITICAL" && i.status !== "CLOSED").length;
  const mttr = averageMttrMinutes(
    incidents.map((i) => ({
      severity: i.severity, status: i.status, reportedAt: new Date(i.reportedAt),
      acknowledgedAt: i.acknowledgedAt ? new Date(i.acknowledgedAt) : null,
      resolvedAt: i.resolvedAt ? new Date(i.resolvedAt) : null,
    }))
  );
  const breaches = incidents.filter((i) => {
    if (i.status === "RESOLVED" || i.status === "CLOSED") return false;
    const sla = computeIncidentSla({
      severity: i.severity, status: i.status, reportedAt: new Date(i.reportedAt),
      acknowledgedAt: i.acknowledgedAt ? new Date(i.acknowledgedAt) : null,
      resolvedAt: i.resolvedAt ? new Date(i.resolvedAt) : null,
    });
    return sla.ackBreached || sla.resolveBreached;
  }).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Total Incidents" value={String(incidents.length)} />
        <StatCard label="Open / In Progress" value={String(open)} tone={open > 0 ? "warn" : "good"} />
        <StatCard label="Critical (unresolved)" value={String(critical)} tone={critical > 0 ? "bad" : "good"} />
        <StatCard label="SLA Breaches" value={String(breaches)} tone={breaches > 0 ? "bad" : "good"} />
        <StatCard label="Avg. Resolution (MTTR)" value={mttr != null ? formatMinutes(mttr) : "—"} />
      </div>

      {actionError && <p className="text-xs text-rose-600">{actionError}</p>}

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
                {users.length > 0 && (
                  <select value={form.reportedByUserId} onChange={(e) => setForm((f) => ({ ...f, reportedByUserId: e.target.value, reportedBy: e.target.value ? "" : f.reportedBy }))} className={`${fieldCls} mb-1.5`}>
                    <option value="">— pick a teammate —</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                )}
                <input
                  value={form.reportedBy}
                  onChange={(e) => setForm((f) => ({ ...f, reportedBy: e.target.value, reportedByUserId: e.target.value ? "" : f.reportedByUserId }))}
                  className={fieldCls}
                  placeholder="or type a name (e.g. a customer)"
                />
              </FormField>
              <FormField label="Assignee">
                {users.length > 0 && (
                  <select value={form.assigneeUserId} onChange={(e) => setForm((f) => ({ ...f, assigneeUserId: e.target.value, assignee: e.target.value ? "" : f.assignee }))} className={`${fieldCls} mb-1.5`}>
                    <option value="">Unassigned</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                )}
                <input
                  value={form.assignee}
                  onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value, assigneeUserId: e.target.value ? "" : f.assigneeUserId }))}
                  className={fieldCls}
                  placeholder="or type a name"
                />
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
              <th className="px-4 py-2.5 font-medium">SLA</th>
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
                        setNewComment("");
                      }}
                      className="font-medium text-slate-800 hover:text-accent-600 text-left"
                    >
                      {inc.title}
                    </button>
                    {inc.escalatedAt && <p className="text-[11px] text-rose-600 mt-0.5">Escalated {formatDate(inc.escalatedAt)}</p>}
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
                  <td className="px-4 py-3"><SlaBadge incident={inc} /></td>
                  <td className="px-4 py-3 text-xs text-slate-600">{personLabel(inc.assigneeUserId, inc.assignee)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(inc.reportedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => remove(inc.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
                {openIncidentId === inc.id && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-xs text-slate-600 max-w-2xl">{inc.description || "No description provided."}</p>
                        <button onClick={() => setOpenIncidentId(null)} className="text-slate-400 hover:text-slate-600">
                          <X size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <FormField label="Reassign">
                          <select
                            value={inc.assigneeUserId ?? ""}
                            onChange={(e) => reassign(inc.id, e.target.value)}
                            className={fieldCls}
                          >
                            <option value="">{inc.assignee ? `Unassigned (was: ${inc.assignee})` : "Unassigned"}</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        </FormField>
                        <div className="text-xs text-slate-500 flex flex-col justify-end gap-0.5">
                          <span>Reported by {personLabel(inc.reportedByUserId, inc.reportedBy)}</span>
                          {inc.acknowledgedAt && <span>Acknowledged {formatDateTime(inc.acknowledgedAt)}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <button
                          onClick={() => getRecommendation(inc.id)}
                          disabled={recommending === inc.id}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
                        >
                          {recommending === inc.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                          Get AI Recommendation
                        </button>
                        {inc.projectId && !inc.followUpTaskId && (
                          <button
                            onClick={() => createFollowUp(inc.id)}
                            disabled={followingUp === inc.id}
                            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                          >
                            {followingUp === inc.id ? <Loader2 size={13} className="animate-spin" /> : <ClipboardList size={13} />}
                            Create follow-up task
                          </button>
                        )}
                        {inc.followUpTaskId && inc.projectId && (
                          <Link href={`/projects/${inc.projectId}`} className="text-xs font-medium text-accent-600 hover:underline">
                            Follow-up task created — view project →
                          </Link>
                        )}
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
                        className="mt-2 mb-4 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                      >
                        Save resolution notes
                      </button>

                      <div className="border-t border-slate-200 pt-3">
                        <p className="text-xs font-semibold text-slate-700 mb-2">Timeline</p>
                        {updatesLoading === inc.id ? (
                          <p className="text-xs text-slate-400">Loading…</p>
                        ) : (
                          <div className="space-y-2 mb-2 max-h-48 overflow-y-auto">
                            {(updatesById[inc.id] ?? []).map((u) => (
                              <div key={u.id} className="text-xs bg-white border border-slate-100 rounded-lg px-2.5 py-2">
                                <div className="flex items-center justify-between text-slate-400 mb-0.5">
                                  <span className="font-medium text-slate-600">{u.authorName}</span>
                                  <span>{formatDateTime(u.createdAt)}</span>
                                </div>
                                <p className="text-slate-700 whitespace-pre-wrap">{u.body}</p>
                              </div>
                            ))}
                            {(updatesById[inc.id] ?? []).length === 0 && (
                              <p className="text-xs text-slate-400">No updates yet.</p>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="Add a timeline update…"
                            className={fieldCls}
                            onKeyDown={(e) => { if (e.key === "Enter") postComment(inc.id); }}
                          />
                          <button
                            onClick={() => postComment(inc.id)}
                            disabled={postingComment || !newComment.trim()}
                            className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
                          >
                            {postingComment ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {incidents.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No incidents logged. Everything&apos;s quiet.</td></tr>
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
