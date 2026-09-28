"use client";
import { useEffect, useState } from "react";
import { formatDate } from "@/lib/format";
import { MessageSquare, Plus } from "lucide-react";

type Resource = { id: string; name: string };

type StandupEntry = {
  id: string;
  resourceId: string | null;
  date: string;
  yesterday: string | null;
  today: string | null;
  blockers: string | null;
};

type Retro = {
  id: string;
  wentWell: string | null;
  toImprove: string | null;
  actionItems: string | null;
  updatedBy: string | null;
  updatedAt: string;
} | null;

type Planning = {
  id: string;
  plannedPoints: number | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string;
} | null;

type Review = {
  id: string;
  demoNotes: string | null;
  stakeholderFeedback: string | null;
  updatedBy: string | null;
  updatedAt: string;
} | null;

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";
const textareaCls = "w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 min-h-[60px]";

// All four Scrum ceremony artifacts for one sprint -- Sprint Planning, Daily Standup log,
// Sprint Review, and Sprint Retrospective -- self-fetching (own GET/POST/PATCH calls) so
// SprintBoard.tsx doesn't have to carry this state, same pattern as other self-contained
// project-tab widgets. Re-fetches whenever the selected sprintId changes (see the key={sprintId}
// remount on the call site, which is also why loading starts true rather than being reset here).
// Backlog Refinement is intentionally not represented -- there's no natural single-record shape
// for an ongoing grooming activity the way there is for these four point-in-time ceremonies.
export default function SprintStandupRetro({
  projectId,
  sprintId,
  allResources,
}: {
  projectId: string;
  sprintId: string;
  allResources: Resource[];
}) {
  const [entries, setEntries] = useState<StandupEntry[]>([]);
  const [retro, setRetro] = useState<Retro>(null);
  const [planning, setPlanning] = useState<Planning>(null);
  const [review, setReview] = useState<Review>(null);
  const [loading, setLoading] = useState(true);
  const [showStandupForm, setShowStandupForm] = useState(false);
  const [showRetro, setShowRetro] = useState(false);
  const [showPlanning, setShowPlanning] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [draft, setDraft] = useState({ resourceId: "", yesterday: "", today: "", blockers: "" });
  const [retroDraft, setRetroDraft] = useState({ wentWell: "", toImprove: "", actionItems: "" });
  const [planningDraft, setPlanningDraft] = useState({ plannedPoints: "", notes: "" });
  const [reviewDraft, setReviewDraft] = useState({ demoNotes: "", stakeholderFeedback: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([
      fetch(`/api/projects/${projectId}/sprints/${sprintId}/standups`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/projects/${projectId}/sprints/${sprintId}/retro`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${projectId}/sprints/${sprintId}/planning`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/projects/${projectId}/sprints/${sprintId}/review`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([standups, r, p, rv]) => {
        setEntries(Array.isArray(standups) ? standups : []);
        setRetro(r);
        setRetroDraft({ wentWell: r?.wentWell ?? "", toImprove: r?.toImprove ?? "", actionItems: r?.actionItems ?? "" });
        setPlanning(p);
        setPlanningDraft({ plannedPoints: p?.plannedPoints != null ? String(p.plannedPoints) : "", notes: p?.notes ?? "" });
        setReview(rv);
        setReviewDraft({ demoNotes: rv?.demoNotes ?? "", stakeholderFeedback: rv?.stakeholderFeedback ?? "" });
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, [projectId, sprintId]);

  const resourceName = (id: string | null) => allResources.find((r) => r.id === id)?.name ?? "Someone";

  async function submitStandup() {
    if (!draft.yesterday.trim() && !draft.today.trim() && !draft.blockers.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/sprints/${sprintId}/standups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setDraft({ resourceId: "", yesterday: "", today: "", blockers: "" });
      setShowStandupForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function saveRetro() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}/retro`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retroDraft),
      });
      if (res.ok) setRetro(await res.json());
    } finally {
      setSaving(false);
    }
  }

  async function savePlanning() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}/planning`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planningDraft),
      });
      if (res.ok) setPlanning(await res.json());
    } finally {
      setSaving(false);
    }
  }

  async function saveReview() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sprints/${sprintId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reviewDraft),
      });
      if (res.ok) setReview(await res.json());
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div className="mt-4 space-y-4">
      <div>
        <button
          onClick={() => setShowPlanning((s) => !s)}
          className="text-xs font-semibold text-slate-700 hover:text-accent-600"
        >
          {showPlanning ? "▾" : "▸"} Sprint Planning {planning && "(saved)"}
        </button>
        {showPlanning && (
          <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2">
            <div>
              <p className="text-xs text-slate-400 mb-1">Committed story points</p>
              <input
                type="number"
                min={0}
                value={planningDraft.plannedPoints}
                onChange={(e) => setPlanningDraft((d) => ({ ...d, plannedPoints: e.target.value }))}
                className={`${inputCls} max-w-[140px]`}
                placeholder="e.g. 24"
              />
              <p className="text-xs text-slate-400 mt-1">Compare against the Velocity chart below once the sprint completes.</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Planning notes</p>
              <textarea
                value={planningDraft.notes}
                onChange={(e) => setPlanningDraft((d) => ({ ...d, notes: e.target.value }))}
                className={textareaCls}
                placeholder="Capacity assumptions, dependencies called out during planning, etc."
              />
            </div>
            <button
              onClick={savePlanning}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save planning"}
            </button>
            {planning?.updatedBy && (
              <p className="text-xs text-slate-400">Last updated by {planning.updatedBy} on {formatDate(planning.updatedAt)}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <MessageSquare size={13} /> Daily Standup log
          </p>
          <button
            onClick={() => setShowStandupForm((s) => !s)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
          >
            <Plus size={12} /> Add entry
          </button>
        </div>

        {showStandupForm && (
          <div className="mb-3 p-3 bg-slate-50 rounded-lg space-y-2">
            <select
              value={draft.resourceId}
              onChange={(e) => setDraft((d) => ({ ...d, resourceId: e.target.value }))}
              className={inputCls}
            >
              <option value="">Who is this for?</option>
              {allResources.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <textarea
              placeholder="What did you do yesterday?"
              value={draft.yesterday}
              onChange={(e) => setDraft((d) => ({ ...d, yesterday: e.target.value }))}
              className={textareaCls}
            />
            <textarea
              placeholder="What will you do today?"
              value={draft.today}
              onChange={(e) => setDraft((d) => ({ ...d, today: e.target.value }))}
              className={textareaCls}
            />
            <textarea
              placeholder="Any blockers?"
              value={draft.blockers}
              onChange={(e) => setDraft((d) => ({ ...d, blockers: e.target.value }))}
              className={textareaCls}
            />
            <button
              onClick={submitStandup}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Log entry"}
            </button>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">No standup entries logged yet for this sprint.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {entries.map((e) => (
              <div key={e.id} className="border border-slate-100 rounded-lg px-3 py-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-slate-700">{resourceName(e.resourceId)}</span>
                  <span className="text-slate-400">{formatDate(e.date)}</span>
                </div>
                {e.yesterday && <p className="text-slate-500"><span className="text-slate-400">Yesterday:</span> {e.yesterday}</p>}
                {e.today && <p className="text-slate-500"><span className="text-slate-400">Today:</span> {e.today}</p>}
                {e.blockers && <p className="text-rose-600"><span className="text-slate-400">Blockers:</span> {e.blockers}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <button
          onClick={() => setShowReview((s) => !s)}
          className="text-xs font-semibold text-slate-700 hover:text-accent-600"
        >
          {showReview ? "▾" : "▸"} Sprint Review {review && "(saved)"}
        </button>
        {showReview && (
          <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2">
            <div>
              <p className="text-xs text-slate-400 mb-1">What was demoed</p>
              <textarea
                value={reviewDraft.demoNotes}
                onChange={(e) => setReviewDraft((d) => ({ ...d, demoNotes: e.target.value }))}
                className={textareaCls}
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Stakeholder feedback</p>
              <textarea
                value={reviewDraft.stakeholderFeedback}
                onChange={(e) => setReviewDraft((d) => ({ ...d, stakeholderFeedback: e.target.value }))}
                className={textareaCls}
              />
            </div>
            <button
              onClick={saveReview}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save review"}
            </button>
            {review?.updatedBy && (
              <p className="text-xs text-slate-400">Last updated by {review.updatedBy} on {formatDate(review.updatedAt)}</p>
            )}
          </div>
        )}
      </div>

      <div>
        <button
          onClick={() => setShowRetro((s) => !s)}
          className="text-xs font-semibold text-slate-700 hover:text-accent-600"
        >
          {showRetro ? "▾" : "▸"} Sprint Retrospective {retro && "(saved)"}
        </button>
        {showRetro && (
          <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2">
            <div>
              <p className="text-xs text-slate-400 mb-1">What went well</p>
              <textarea
                value={retroDraft.wentWell}
                onChange={(e) => setRetroDraft((d) => ({ ...d, wentWell: e.target.value }))}
                className={textareaCls}
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">What could improve</p>
              <textarea
                value={retroDraft.toImprove}
                onChange={(e) => setRetroDraft((d) => ({ ...d, toImprove: e.target.value }))}
                className={textareaCls}
              />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Action items</p>
              <textarea
                value={retroDraft.actionItems}
                onChange={(e) => setRetroDraft((d) => ({ ...d, actionItems: e.target.value }))}
                className={textareaCls}
              />
            </div>
            <button
              onClick={saveRetro}
              disabled={saving}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save retrospective"}
            </button>
            {retro?.updatedBy && (
              <p className="text-xs text-slate-400">Last updated by {retro.updatedBy} on {formatDate(retro.updatedAt)}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
