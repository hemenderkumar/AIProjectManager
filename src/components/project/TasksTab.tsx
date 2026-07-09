"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { PriorityBadge } from "@/components/badges";
import { formatDate } from "@/lib/format";
import { Plus, Sparkles, Loader2, Bot, Mail, Check, X } from "lucide-react";

type Resource = { id: string; name: string };

type PlanTask = {
  title: string;
  description?: string;
  estimateHours?: number;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedRole?: string;
  suggestedHourlyRate?: number;
  phase?: string;
  dueInDays?: number;
  rate?: number;
  resolvedAssigneeName?: string | null;
};

type PlanMilestone = { name: string; phase?: string; dueInDays?: number };
type PlanFollowUp = { title: string; description?: string; dueInDays?: number };

type TeamCompositionRow = {
  role: string;
  hours: number;
  rate: number;
  cost: number;
  matchedResourceName: string | null;
};

type PhaseRow = { phase: string; hours: number; cost: number; taskCount: number };

type PlanPreview = {
  plan: { milestones: PlanMilestone[]; tasks: PlanTask[]; agentFollowUps: PlanFollowUp[] };
  totalEffortHours: number;
  suggestedStartDate: string;
  suggestedEndDate: string;
  teamComposition: TeamCompositionRow[];
  phaseBreakdown: PhaseRow[];
  totalEstimatedCost: number;
};

const PHASE_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  DESIGN: "Design",
  DEVELOPMENT: "Development",
  TESTING: "Testing",
  DEPLOYMENT: "Deployment",
};

export default function TasksTab({ detail, allResources }: { detail: ProjectDetail; allResources: Resource[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", assigneeId: "", priority: "MEDIUM", dueDate: "", estimateHours: 0 });

  const [showPlanner, setShowPlanner] = useState(false);
  const [goal, setGoal] = useState(
    [detail.project.problemStatement, detail.project.proposedSolution].filter(Boolean).join(" ")
  );
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [editedTasks, setEditedTasks] = useState<PlanTask[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [requestingFor, setRequestingFor] = useState<string | null>(null);

  const resourceName = (id: string | null) => allResources.find((r) => r.id === id)?.name ?? "Unassigned";

  async function addTask() {
    if (!form.title.trim()) return;
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, assigneeId: form.assigneeId || null }),
    });
    setSaving(false);
    setForm({ title: "", assigneeId: "", priority: "MEDIUM", dueDate: "", estimateHours: 0 });
    setShowForm(false);
    router.refresh();
  }

  async function updateStatus(taskId: string, status: string) {
    await fetch(`/api/projects/${detail.project.id}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function generatePlan() {
    if (!goal.trim()) return;
    setPlanning(true);
    setPlanError(null);
    setPreview(null);
    const res = await fetch("/api/ai/plan-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: detail.project.id, goal }),
    });
    setPlanning(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPlanError(data.error ?? "Planning failed");
      return;
    }
    setPreview(data);
    setEditedTasks(data.plan.tasks);
    setStartDate(data.suggestedStartDate);
    setEndDate(data.suggestedEndDate);
  }

  function updateTaskHours(index: number, hours: number) {
    setEditedTasks((prev) => prev.map((t, i) => (i === index ? { ...t, estimateHours: hours } : t)));
  }

  const editedTotalHours = editedTasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0);
  const editedTotalCost = editedTasks.reduce((sum, t) => sum + (t.estimateHours ?? 0) * (t.rate ?? 75), 0);

  async function confirmPlan() {
    if (!preview) return;
    setConfirming(true);
    const res = await fetch("/api/ai/plan-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: detail.project.id,
        confirm: true,
        plan: { ...preview.plan, tasks: editedTasks },
        startDate,
        targetEndDate: endDate,
        budgetPlanned: Math.round(editedTotalCost),
      }),
    });
    setConfirming(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPlanError(data.error ?? "Could not create the plan");
      return;
    }
    setShowPlanner(false);
    setPreview(null);
    router.refresh();
  }

  function discardPreview() {
    setPreview(null);
    setEditedTasks([]);
  }

  async function requestStatus(taskId: string, resourceId: string | null) {
    if (!resourceId) return;
    setRequestingFor(taskId);
    const res = await fetch("/api/status-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: detail.project.id, taskId, resourceId }),
    });
    const data = await res.json();
    setRequestingFor(null);
    if (data.link) {
      await navigator.clipboard.writeText(data.link).catch(() => {});
      alert(
        data.emailed
          ? `Status request emailed to the assignee. Link also copied: ${data.link}`
          : `No email configured — link copied to your clipboard instead:\n${data.link}`
      );
    }
    router.refresh();
  }

  const agentTasks = detail.tasks.filter((t) => t.isAgentTask);
  const regularTasks = detail.tasks.filter((t) => !t.isAgentTask);

  const sorted = [...regularTasks].sort((a, b) => {
    const order = { BLOCKED: 0, IN_PROGRESS: 1, TODO: 2, DONE: 3 } as Record<string, number>;
    return order[a.status] - order[b.status];
  });

  return (
    <div className="max-w-4xl space-y-4">
      <Card
        title="AI project planner"
        action={
          <button
            onClick={() => setShowPlanner((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >
            <Sparkles size={14} /> Plan with AI
          </button>
        }
      >
        <p className="text-xs text-slate-400 mb-3">
          Describe the goal — the AI PM drafts milestones across planning, design, development, testing
          and deployment, estimates effort and cost per role, and suggests a start/end date. Nothing is
          created until you review and approve it below.
        </p>
        {showPlanner && (
          <div className="p-4 bg-slate-50 rounded-lg space-y-3">
            <Field label="Goal">
              <textarea value={goal} onChange={(e) => setGoal(e.target.value)} className={inputCls} rows={3} />
            </Field>
            {planError && <p className="text-xs text-rose-600">{planError}</p>}
            {!preview && (
              <PrimaryButton onClick={generatePlan} disabled={planning} className="flex items-center gap-1.5">
                {planning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {planning ? "Estimating..." : "Generate plan"}
              </PrimaryButton>
            )}

            {preview && (
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-3 gap-3">
                  <SummaryStat label="Total effort" value={`${editedTotalHours.toFixed(0)} hrs`} />
                  <SummaryStat label="Estimated cost" value={`$${editedTotalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                  <SummaryStat label="Duration" value={`${Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))} days`} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start date">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Target end date">
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <p className="text-[11px] text-slate-400 -mt-2">
                  Dates are auto-calculated from total effort vs. team capacity — adjust if needed.
                </p>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Who you&apos;ll need</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-200">
                        <th className="py-1.5 font-medium">Role</th>
                        <th className="py-1.5 font-medium">Staffing</th>
                        <th className="py-1.5 font-medium text-right">Hours</th>
                        <th className="py-1.5 font-medium text-right">Rate</th>
                        <th className="py-1.5 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.teamComposition.map((r) => (
                        <tr key={r.role} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 font-medium text-slate-700">{r.role}</td>
                          <td className="py-1.5">
                            {r.matchedResourceName ? (
                              <span className="text-emerald-600">{r.matchedResourceName}</span>
                            ) : (
                              <span className="text-amber-600">Needs staffing</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right">{r.hours}h</td>
                          <td className="py-1.5 text-right">${r.rate}/hr</td>
                          <td className="py-1.5 text-right">${r.cost.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Plan by phase</p>
                  <div className="grid grid-cols-5 gap-2">
                    {preview.phaseBreakdown.map((p) => (
                      <div key={p.phase} className="border border-slate-200 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-slate-400">{PHASE_LABELS[p.phase] ?? p.phase}</p>
                        <p className="text-sm font-semibold text-slate-800">{p.taskCount} tasks</p>
                        <p className="text-[10px] text-slate-500">{p.hours}h · ${p.cost.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Tasks — adjust hours if needed</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-200">
                        <th className="py-1.5 font-medium">Phase</th>
                        <th className="py-1.5 font-medium">Task</th>
                        <th className="py-1.5 font-medium">Role</th>
                        <th className="py-1.5 font-medium text-right">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editedTasks.map((t, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 text-slate-400">{PHASE_LABELS[t.phase ?? ""] ?? t.phase}</td>
                          <td className="py-1.5 text-slate-700">{t.title}</td>
                          <td className="py-1.5 text-slate-500">
                            {t.resolvedAssigneeName ?? t.suggestedRole ?? "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              value={t.estimateHours ?? 0}
                              onChange={(e) => updateTaskHours(i, Number(e.target.value))}
                              className="w-16 text-right text-xs border border-slate-200 rounded px-1 py-0.5"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <PrimaryButton onClick={confirmPlan} disabled={confirming} className="flex items-center gap-1.5">
                    {confirming ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {confirming ? "Creating..." : "Approve & create plan"}
                  </PrimaryButton>
                  <button
                    onClick={discardPreview}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
                  >
                    <X size={14} /> Discard
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Cost estimates use your team&apos;s actual hourly rates where a role is matched, and a
                  market-rate guess for roles you haven&apos;t staffed yet — treat this as a planning estimate,
                  not a quote.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {agentTasks.length > 0 && (
        <Card title={`AI PM follow-ups (${agentTasks.length})`}>
          <div className="space-y-2">
            {agentTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                <div className="flex items-start gap-2">
                  <Bot size={14} className="text-indigo-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{t.title}</p>
                    {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
                  </div>
                </div>
                <select
                  value={t.status}
                  onChange={(e) => updateStatus(t.id, e.target.value)}
                  className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                >
                  {["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        title={`Tasks (${regularTasks.length})`}
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          >
            <Plus size={14} /> Add Task
          </button>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <Field label="Title">
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Assignee">
                <select value={form.assigneeId} onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))} className={inputCls}>
                  <option value="">Unassigned</option>
                  {allResources.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={inputCls}>
                  {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Due date">
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className={inputCls} />
              </Field>
            </div>
            <PrimaryButton onClick={addTask} disabled={saving}>{saving ? "Adding..." : "Add Task"}</PrimaryButton>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 font-medium">Task</th>
              <th className="py-2 font-medium">Assignee</th>
              <th className="py-2 font-medium">Priority</th>
              <th className="py-2 font-medium">Due</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 font-medium text-slate-800">
                  {t.title}
                  {t.createdByAi && <span className="ml-1.5 text-[10px] text-indigo-500 align-middle">AI</span>}
                </td>
                <td className="py-2.5 text-slate-600">{resourceName(t.assigneeId)}</td>
                <td className="py-2.5"><PriorityBadge priority={t.priority} /></td>
                <td className="py-2.5 text-slate-600">{formatDate(t.dueDate)}</td>
                <td className="py-2.5">
                  <select
                    value={t.status}
                    onChange={(e) => updateStatus(t.id, e.target.value)}
                    className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white"
                  >
                    {["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2.5 text-right">
                  {t.assigneeId && t.status !== "DONE" && (
                    <button
                      onClick={() => requestStatus(t.id, t.assigneeId)}
                      disabled={requestingFor === t.id}
                      title="Request a status update from the assignee"
                      className="text-slate-400 hover:text-indigo-600 disabled:opacity-50"
                    >
                      {requestingFor === t.id ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">No tasks yet.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5 text-center bg-white">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
