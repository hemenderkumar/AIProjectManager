"use client";
import { useEffect, useMemo, useState } from "react";

type TimelineTask = {
  id: string;
  title: string;
  status: string;
  startDate: string | Date | null;
  dueDate: string | Date | null;
  createdAt: string | Date;
};

type Edge = { id: string; taskId: string; dependsOnTaskId: string };

const STATUS_COLORS: Record<string, string> = {
  TODO: "bg-slate-300",
  IN_PROGRESS: "bg-accent-500",
  BLOCKED: "bg-rose-400",
  DONE: "bg-emerald-500",
};

// Lightweight custom Gantt/timeline (#264) -- percentage-positioned bars across a computed
// date range rather than a charting-library hack (this codebase's only chart library,
// Recharts, has no native Gantt primitive). Good enough for "see the schedule and what's
// blocking what at a glance," not meant to replace a dedicated PM timeline tool.
export default function TimelineView({ projectId, tasks }: { projectId: string; tasks: TimelineTask[] }) {
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/dependencies`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setEdges(Array.isArray(rows) ? rows : []))
      .catch(() => setEdges([]));
  }, [projectId]);

  const titleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const dependsOnByTask = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of edges) {
      if (!m.has(e.taskId)) m.set(e.taskId, []);
      m.get(e.taskId)!.push(titleById.get(e.dependsOnTaskId) ?? "Unknown task");
    }
    return m;
  }, [edges, titleById]);

  const rows = useMemo(() => {
    return tasks
      .map((t) => {
        const start = t.startDate ? new Date(t.startDate) : new Date(t.createdAt);
        let end = t.dueDate ? new Date(t.dueDate) : new Date(start.getTime() + 24 * 60 * 60 * 1000);
        if (end < start) end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
        return { ...t, start, end };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [tasks]);

  if (rows.length === 0) {
    return <p className="text-xs text-slate-400 py-6 text-center">No tasks yet.</p>;
  }

  const rangeStart = new Date(Math.min(...rows.map((r) => r.start.getTime())));
  const rangeEnd = new Date(Math.max(...rows.map((r) => r.end.getTime())));
  // Pad the range by a day on each side so bars never sit flush against the edge.
  const paddedStart = new Date(rangeStart.getTime() - 24 * 60 * 60 * 1000);
  const paddedEnd = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
  const totalMs = Math.max(paddedEnd.getTime() - paddedStart.getTime(), 24 * 60 * 60 * 1000);

  function pct(date: Date) {
    return ((date.getTime() - paddedStart.getTime()) / totalMs) * 100;
  }

  const todayPct = pct(new Date());
  const showToday = todayPct >= 0 && todayPct <= 100;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 text-xs text-slate-400">
        <span>{paddedStart.toLocaleDateString()}</span>
        {showToday && <span className="text-rose-400">Today</span>}
        <span>{paddedEnd.toLocaleDateString()}</span>
      </div>
      <div className="divide-y divide-slate-50">
        {rows.map((r) => {
          const left = pct(r.start);
          const width = Math.max(pct(r.end) - left, 1.5);
          const deps = dependsOnByTask.get(r.id);
          return (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2">
              <div className="w-40 shrink-0">
                <p className={`text-xs truncate ${r.status === "DONE" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  {r.title}
                </p>
                {deps && deps.length > 0 && (
                  <p className="text-[10px] text-slate-400 truncate">Blocked by: {deps.join(", ")}</p>
                )}
              </div>
              <div className="flex-1 relative h-4 bg-slate-50 rounded">
                {showToday && <div className="absolute top-0 bottom-0 w-px bg-rose-300" style={{ left: `${todayPct}%` }} />}
                <div
                  className={`absolute top-0.5 bottom-0.5 rounded ${STATUS_COLORS[r.status] ?? "bg-slate-300"}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${r.start.toLocaleDateString()} – ${r.end.toLocaleDateString()}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
