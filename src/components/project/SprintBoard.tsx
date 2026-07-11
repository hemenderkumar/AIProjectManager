"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDate, formatDateInput } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

type Resource = { id: string; name: string };

const STATUS_COLUMNS = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

export default function SprintBoard({ detail, allResources }: { detail: ProjectDetail; allResources: Resource[] }) {
  const router = useRouter();
  const sprints = useMemo(() => detail.sprints ?? [], [detail.sprints]);
  const allTasks = useMemo(() => detail.tasks.filter((t) => !t.isAgentTask), [detail.tasks]);

  // Date.now() can't be called during render (impure) — capture "today" once via effect so
  // the burndown chart's "has this day happened yet" check has a stable, side-effect-free value.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, []);

  const [selectedSprintId, setSelectedSprintId] = useState<string>(sprints.find((s) => s.status === "ACTIVE")?.id ?? "backlog");
  const [showNewSprint, setShowNewSprint] = useState(false);
  const [newSprint, setNewSprint] = useState({ name: "", goal: "", startDate: formatDateInput(new Date()), endDate: "" });
  const [saving, setSaving] = useState(false);

  const resourceName = (id: string | null) => allResources.find((r) => r.id === id)?.name ?? "Unassigned";

  const backlogTasks = allTasks.filter((t) => !t.sprintId);
  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);
  const sprintTasks = selectedSprint ? allTasks.filter((t) => t.sprintId === selectedSprint.id) : backlogTasks;

  async function createSprint() {
    if (!newSprint.name.trim()) return;
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/sprints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSprint),
    });
    setSaving(false);
    setShowNewSprint(false);
    setNewSprint({ name: "", goal: "", startDate: formatDateInput(new Date()), endDate: "" });
    router.refresh();
  }

  async function updateSprint(sprintId: string, patch: Record<string, unknown>) {
    await fetch(`/api/projects/${detail.project.id}/sprints/${sprintId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
  }

  async function deleteSprint(sprintId: string) {
    await fetch(`/api/projects/${detail.project.id}/sprints/${sprintId}`, { method: "DELETE" });
    setSelectedSprintId("backlog");
    router.refresh();
  }

  async function updateTask(taskId: string, patch: Record<string, unknown>) {
    await fetch(`/api/projects/${detail.project.id}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
  }

  const velocityData = useMemo(
    () =>
      sprints
        .filter((s) => s.status === "COMPLETED")
        .map((s) => ({
          name: s.name,
          points: allTasks
            .filter((t) => t.sprintId === s.id && t.status === "DONE")
            .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0),
        })),
    [sprints, allTasks]
  );

  const burndownData = useMemo(() => {
    if (!selectedSprint?.startDate || !selectedSprint?.endDate || now == null) return [];
    const start = new Date(selectedSprint.startDate).getTime();
    const end = new Date(selectedSprint.endDate).getTime();
    const totalDays = Math.max(1, Math.round((end - start) / 86400000));
    const totalPoints = sprintTasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
    if (totalPoints === 0) return [];

    const days = [];
    for (let d = 0; d <= totalDays; d++) {
      const dayTime = start + d * 86400000;
      const completedByDay = sprintTasks
        .filter((t) => t.completedAt && new Date(t.completedAt).getTime() <= dayTime)
        .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
      days.push({
        day: `Day ${d}`,
        ideal: Math.round(totalPoints * (1 - d / totalDays)),
        actual: dayTime <= now ? totalPoints - completedByDay : null,
      });
    }
    return days;
  }, [selectedSprint, sprintTasks, now]);

  return (
    <Card
      title="Sprints"
      action={
        <button
          onClick={() => setShowNewSprint((s) => !s)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
        >
          <Plus size={14} /> New Sprint
        </button>
      }
    >
      {showNewSprint && (
        <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name">
              <input value={newSprint.name} onChange={(e) => setNewSprint((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Sprint 1" />
            </Field>
            <Field label="Goal">
              <input value={newSprint.goal} onChange={(e) => setNewSprint((f) => ({ ...f, goal: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Start date">
              <input type="date" value={newSprint.startDate} onChange={(e) => setNewSprint((f) => ({ ...f, startDate: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="End date">
              <input type="date" value={newSprint.endDate} onChange={(e) => setNewSprint((f) => ({ ...f, endDate: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <PrimaryButton onClick={createSprint} disabled={saving}>{saving ? "Creating..." : "Create sprint"}</PrimaryButton>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
        <button
          onClick={() => setSelectedSprintId("backlog")}
          className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px ${
            selectedSprintId === "backlog" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Backlog ({backlogTasks.length})
        </button>
        {sprints.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSprintId(s.id)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px ${
              selectedSprintId === s.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {s.name} {s.status === "ACTIVE" && "🟢"}
          </button>
        ))}
      </div>

      {selectedSprint && (
        <div className="mb-4 flex items-start justify-between">
          <div>
            {selectedSprint.goal && <p className="text-xs text-slate-500 mb-1">{selectedSprint.goal}</p>}
            <p className="text-[11px] text-slate-400">
              {formatDate(selectedSprint.startDate)} — {formatDate(selectedSprint.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedSprint.status}
              onChange={(e) => updateSprint(selectedSprint.id, { status: e.target.value })}
              className="text-xs border border-slate-200 rounded-md px-2 py-1 bg-white"
            >
              {["PLANNED", "ACTIVE", "COMPLETED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={() => deleteSprint(selectedSprint.id)} className="text-slate-400 hover:text-rose-600">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {selectedSprintId === "backlog" ? (
        <div className="space-y-1.5 mb-2">
          {backlogTasks.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">Backlog is empty.</p>}
          {backlogTasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 text-xs">
              <span className="text-slate-700 flex-1">{t.title}</span>
              <span className="text-slate-400">{resourceName(t.assigneeId)}</span>
              <input
                type="number"
                min={0}
                defaultValue={t.storyPoints ?? 0}
                onBlur={(e) => updateTask(t.id, { storyPoints: Number(e.target.value) })}
                className="w-14 text-right border border-slate-200 rounded px-1.5 py-1"
                title="Story points"
              />
              <select
                defaultValue=""
                onChange={(e) => e.target.value && updateTask(t.id, { sprintId: e.target.value })}
                className="border border-slate-200 rounded-md px-1.5 py-1 bg-white"
              >
                <option value="">Move to sprint...</option>
                {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
          {STATUS_COLUMNS.map((status) => (
            <div key={status} className="bg-slate-50 rounded-lg p-2 min-h-[120px]">
              <p className="text-[11px] font-semibold text-slate-500 mb-2">{STATUS_LABELS[status]}</p>
              <div className="space-y-1.5">
                {sprintTasks
                  .filter((t) => t.status === status)
                  .map((t) => (
                    <div key={t.id} className="bg-white border border-slate-200 rounded-lg p-2">
                      <p className="text-xs text-slate-800 mb-1">{t.title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">{resourceName(t.assigneeId)}</span>
                        {t.storyPoints != null && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">{t.storyPoints} pts</span>
                        )}
                      </div>
                      <select
                        value={t.status}
                        onChange={(e) => updateTask(t.id, { status: e.target.value })}
                        className="mt-1.5 w-full text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white"
                      >
                        {STATUS_COLUMNS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {velocityData.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-700 mb-2">Velocity (completed sprints)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={velocityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="points" name="Story points completed" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {selectedSprint && burndownData.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-700 mb-2">Burndown — {selectedSprint.name}</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={burndownData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="ideal" name="Ideal" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="actual" name="Actual remaining" stroke="#6366f1" connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
