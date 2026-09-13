"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { RagBadge } from "@/components/badges";
import { formatDateTime } from "@/lib/format";
import { Plus, Send, Copy } from "lucide-react";

const SURVEY_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  EXPIRED: "bg-slate-100 text-slate-500",
};

export default function StatusTab({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ragStatus: detail.project.ragStatus,
    percentComplete: detail.project.percentComplete,
    summary: "",
    accomplishments: "",
    upcoming: "",
    blockers: "",
  });

  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [surveySaving, setSurveySaving] = useState(false);
  const [surveyForm, setSurveyForm] = useState({ respondentName: "", respondentEmail: "" });
  const [lastSurveyLink, setLastSurveyLink] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/status-updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    router.refresh();
  }

  async function sendSurvey() {
    setSurveySaving(true);
    setLastSurveyLink(null);
    const res = await fetch(`/api/projects/${detail.project.id}/satisfaction-surveys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        respondentName: surveyForm.respondentName || undefined,
        respondentEmail: surveyForm.respondentEmail || undefined,
        triggerType: "MANUAL",
      }),
    });
    setSurveySaving(false);
    if (res.ok) {
      const data = await res.json();
      setLastSurveyLink(data.emailed ? null : data.link);
      setShowSurveyForm(false);
      setSurveyForm({ respondentName: "", respondentEmail: "" });
      router.refresh();
    }
  }

  const surveys = detail.satisfactionSurveys ?? [];
  const completedSurveys = surveys.filter((s) => s.status === "COMPLETED");
  const avgNps = completedSurveys.filter((s) => s.npsScore != null).length
    ? completedSurveys.reduce((sum, s) => sum + (s.npsScore ?? 0), 0) / completedSurveys.filter((s) => s.npsScore != null).length
    : null;
  const avgCsat = completedSurveys.filter((s) => s.csatScore != null).length
    ? completedSurveys.reduce((sum, s) => sum + (s.csatScore ?? 0), 0) / completedSurveys.filter((s) => s.csatScore != null).length
    : null;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-accent-50 border border-accent-100 rounded-xl p-4 text-sm text-accent-800">
        <span className="font-semibold">Auto-computed health:</span> {detail.autoRag} — {detail.autoRagReasons.join("; ")}
        {" "}(schedule variance {detail.scheduleVarianceDays} days, budget variance {detail.budgetVariancePercent}%)
      </div>

      <Card
        title="Status Update History"
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
          >
            <Plus size={14} /> Log Status Update
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="RAG status">
                <select value={form.ragStatus} onChange={(e) => setForm((f) => ({ ...f, ragStatus: e.target.value as typeof f.ragStatus }))} className={inputCls}>
                  {["GREEN", "YELLOW", "RED"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="% Complete">
                <input type="number" min={0} max={100} value={form.percentComplete} onChange={(e) => setForm((f) => ({ ...f, percentComplete: Number(e.target.value) }))} className={inputCls} />
              </Field>
            </div>
            <Field label="Summary">
              <textarea value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Accomplishments">
              <textarea value={form.accomplishments} onChange={(e) => setForm((f) => ({ ...f, accomplishments: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Upcoming">
              <textarea value={form.upcoming} onChange={(e) => setForm((f) => ({ ...f, upcoming: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <Field label="Blockers">
              <textarea value={form.blockers} onChange={(e) => setForm((f) => ({ ...f, blockers: e.target.value }))} className={inputCls} rows={2} />
            </Field>
            <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save Update"}</PrimaryButton>
          </div>
        )}

        <div className="space-y-3">
          {detail.statusUpdates.map((u) => (
            <div key={u.id} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <RagBadge rag={u.ragStatus} />
                  <span className="text-xs text-slate-400">{formatDateTime(u.date)}</span>
                </div>
                <span className="text-xs text-slate-500">{u.percentComplete}% complete</span>
              </div>
              {u.summary && <p className="text-sm text-slate-700">{u.summary}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2 text-xs">
                {u.accomplishments && <div><span className="font-medium text-slate-500">Done:</span> {u.accomplishments}</div>}
                {u.upcoming && <div><span className="font-medium text-slate-500">Next:</span> {u.upcoming}</div>}
                {u.blockers && <div><span className="font-medium text-slate-500">Blockers:</span> {u.blockers}</div>}
              </div>
            </div>
          ))}
          {detail.statusUpdates.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No status updates logged yet.</p>
          )}
        </div>
      </Card>

      <Card
        title="Client Satisfaction"
        action={
          <button
            onClick={() => setShowSurveyForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
          >
            <Send size={14} /> Send Survey
          </button>
        }
      >
        {(avgNps != null || avgCsat != null) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {avgNps != null && (
              <div className="border border-slate-200 rounded-lg p-2.5 text-center bg-white">
                <p className="text-xs text-slate-400">Avg. NPS ({completedSurveys.filter((s) => s.npsScore != null).length} responses)</p>
                <p className="text-lg font-semibold text-slate-800">{avgNps.toFixed(1)} / 10</p>
              </div>
            )}
            {avgCsat != null && (
              <div className="border border-slate-200 rounded-lg p-2.5 text-center bg-white">
                <p className="text-xs text-slate-400">Avg. CSAT ({completedSurveys.filter((s) => s.csatScore != null).length} responses)</p>
                <p className="text-lg font-semibold text-slate-800">{avgCsat.toFixed(1)} / 5</p>
              </div>
            )}
          </div>
        )}

        {showSurveyForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <p className="text-xs text-slate-500">Two quick questions (NPS + CSAT), answered via a no-login link.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Recipient name (optional)">
                <input value={surveyForm.respondentName} onChange={(e) => setSurveyForm((f) => ({ ...f, respondentName: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Recipient email (optional — leave blank to just get a link to share yourself)">
                <input type="email" value={surveyForm.respondentEmail} onChange={(e) => setSurveyForm((f) => ({ ...f, respondentEmail: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <PrimaryButton onClick={sendSurvey} disabled={surveySaving}>{surveySaving ? "Sending..." : "Send Survey"}</PrimaryButton>
          </div>
        )}

        {lastSurveyLink && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between gap-2 text-xs">
            <span className="text-blue-700 truncate">No email configured -- share this link: {lastSurveyLink}</span>
            <button
              onClick={() => navigator.clipboard.writeText(lastSurveyLink)}
              className="flex items-center gap-1 text-blue-700 hover:text-blue-900 shrink-0"
            >
              <Copy size={12} /> Copy
            </button>
          </div>
        )}

        <div className="space-y-2">
          {surveys.map((s) => (
            <div key={s.id} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700">{s.respondentName || s.respondentEmail || "Anonymous"}</p>
                  <p className="text-xs text-slate-400">
                    Sent by {s.sentBy} on {formatDateTime(s.sentAt)} · {s.triggerType.replace("_", " ").toLowerCase()}
                  </p>
                  {s.comments && <p className="text-xs text-slate-500 mt-1 italic">&quot;{s.comments}&quot;</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {s.status === "COMPLETED" && (
                    <div className="text-right text-xs text-slate-600">
                      {s.npsScore != null && <p>NPS {s.npsScore}/10</p>}
                      {s.csatScore != null && <p>CSAT {s.csatScore}/5</p>}
                    </div>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SURVEY_STATUS_STYLES[s.status]}`}>
                    {s.status.charAt(0) + s.status.slice(1).toLowerCase()}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {surveys.length === 0 && <p className="text-sm text-center text-slate-400 py-6">No satisfaction surveys sent yet.</p>}
        </div>
      </Card>
    </div>
  );
}
