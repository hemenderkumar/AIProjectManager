"use client";
import { Fragment, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { PriorityBadge } from "@/components/badges";
import { formatDate, formatDateInput } from "@/lib/format";
import { Plus, Sparkles, Loader2, Bot, Mail, Check, X, Clock, Trash2, LayoutGrid, List } from "lucide-react";
import SprintBoard from "./SprintBoard";

type Resource = { id: string; name: string };

type PlanTask = {
  title: string;
  description?: string;
  estimateHours?: number;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedRole?: string;
  suggestedHourlyRate?: number;
  requiredSkills?: string[];
  requiredExperienceYears?: number;
  phase?: string;
  dueInDays?: number;
  rate?: number;
  resolvedAssigneeName?: string | null;
  sprintName?: string;
  storyPoints?: number;
};

const METHODOLOGY_LABELS: Record<string, string> = {
  WATERFALL: "Waterfall (sequential stage-gate)",
  SCRUM: "Scrum (iterative sprints)",
  HYBRID: "Hybrid (stage-gated phases, sprint execution)",
};

type PlanMilestone = { name: string; phase?: string; dueInDays?: number };
type PlanFollowUp = { title: string; description?: string; dueInDays?: number };

type TeamCompositionRow = {
  role: string;
  hours: number;
  rate: number;
  cost: number;
  matchedResourceName: string | null;
  requiredSkills: string[];
};

type PhaseRow = { phase: string; hours: number; cost: number; taskCount: number };

type ApproachRecommendation = {
  summary: string;
  details?: Record<string, string>;
  rationale?: string;
};

type MaterialCostItem = { name: string; amount: number; cadence: string; notes?: string };
type OngoingSupportRole = { role: string; hoursPerWeek?: number };
type OngoingSupportPlan = { summary: string; monthlyCost: number; roles: OngoingSupportRole[] };

type PlanPreview = {
  plan: { milestones: PlanMilestone[]; tasks: PlanTask[]; agentFollowUps: PlanFollowUp[] };
  approach: ApproachRecommendation | null;
  totalEffortHours: number;
  suggestedStartDate: string;
  suggestedEndDate: string;
  teamComposition: TeamCompositionRow[];
  phaseBreakdown: PhaseRow[];
  laborCost: number;
  materialCosts: MaterialCostItem[];
  ongoingSupport: OngoingSupportPlan;
  contingencyPercent: number;
};

// Mirrors PROJECT_TYPES on the server (src/app/api/ai/plan-project/route.ts). Keep the
// keys in sync — only labels/placeholders are needed client-side, the server owns phases.
const PROJECT_TYPES: Record<string, { label: string; approachLabel: string; approachPlaceholder: string }> = {
  TECHNOLOGY: {
    label: "Technology / Software",
    approachLabel: "Preferred technology stack (optional)",
    approachPlaceholder: "e.g. React + Node.js + PostgreSQL — leave blank and the AI PM will recommend one",
  },
  RESEARCH: {
    label: "Research",
    approachLabel: "Preferred research approach or methodology (optional)",
    approachPlaceholder: "e.g. mixed-methods survey + literature review — leave blank and the AI PM will recommend one",
  },
  HANDYMAN: {
    label: "Handyman / Physical / Construction",
    approachLabel: "Preferred materials or approach (optional)",
    approachPlaceholder: "e.g. hardwood flooring, standard building permits — leave blank and the AI PM will recommend one",
  },
  GENERAL: {
    label: "General / Other",
    approachLabel: "Preferred approach or constraints (optional)",
    approachPlaceholder: "Describe any specific approach, tools, or constraints, or leave blank",
  },
};

function phaseLabel(phase: string) {
  return phase
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function TasksTab({
  detail,
  allResources,
  autoPlan,
}: {
  detail: ProjectDetail;
  allResources: Resource[];
  autoPlan?: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", assigneeId: "", priority: "MEDIUM", dueDate: "", estimateHours: 0 });
  const [taskDraftNote, setTaskDraftNote] = useState("");
  const [draftingTask, setDraftingTask] = useState(false);
  const [taskDraftError, setTaskDraftError] = useState<string | null>(null);

  const [showPlanner, setShowPlanner] = useState(autoPlan ?? false);
  const [goal, setGoal] = useState(
    [detail.project.description, detail.project.problemStatement, detail.project.proposedSolution]
      .filter(Boolean)
      .join(" ")
  );
  const [projectType, setProjectType] = useState<string>("TECHNOLOGY");
  const [approach, setApproach] = useState("");
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const autoTriggered = useRef(false);

  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [editedTasks, setEditedTasks] = useState<PlanTask[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [contingencyPercent, setContingencyPercent] = useState(10);
  const [materialCosts, setMaterialCosts] = useState<MaterialCostItem[]>([]);
  const [ongoingSupport, setOngoingSupport] = useState<OngoingSupportPlan>({ summary: "", monthlyCost: 0, roles: [] });

  const [requestingFor, setRequestingFor] = useState<string | null>(null);

  const [openTimeLogTaskId, setOpenTimeLogTaskId] = useState<string | null>(null);
  const [timeLogForm, setTimeLogForm] = useState({ hours: 0, entryDate: formatDateInput(new Date()), notes: "" });
  const [loggingTime, setLoggingTime] = useState(false);

  const [methodology, setMethodology] = useState<string>(detail.project.executionMethodology ?? "WATERFALL");
  const [savingMethodology, setSavingMethodology] = useState(false);
  const [taskView, setTaskView] = useState<"list" | "phase">("list");

  const resourceName = (id: string | null) => allResources.find((r) => r.id === id)?.name ?? "Unassigned";
  const typeConfig = PROJECT_TYPES[projectType] ?? PROJECT_TYPES.TECHNOLOGY;

  async function draftTaskWithAI() {
    if (!taskDraftNote.trim()) return;
    setDraftingTask(true);
    setTaskDraftError(null);
    try {
      const res = await fetch("/api/ai/draft-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: detail.project.id, note: taskDraftNote }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTaskDraftError(data?.error ?? "Couldn't draft this task.");
        return;
      }
      const dueDate =
        typeof data.dueInDays === "number"
          ? formatDateInput(new Date(Date.now() + data.dueInDays * 24 * 60 * 60 * 1000))
          : undefined;
      setForm((f) => ({
        ...f,
        title: data.title ?? f.title,
        priority: data.priority ?? f.priority,
        estimateHours: typeof data.estimateHours === "number" ? data.estimateHours : f.estimateHours,
        dueDate: dueDate ?? f.dueDate,
      }));
    } finally {
      setDraftingTask(false);
    }
  }

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

  async function updateMethodology(value: string) {
    setMethodology(value);
    setSavingMethodology(true);
    await fetch(`/api/projects/${detail.project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionMethodology: value }),
    });
    setSavingMethodology(false);
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
      body: JSON.stringify({ projectId: detail.project.id, goal, projectType, approach, executionMethodology: methodology }),
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
    setContingencyPercent(data.contingencyPercent ?? 10);
    setMaterialCosts(data.materialCosts ?? []);
    setOngoingSupport(data.ongoingSupport ?? { summary: "", monthlyCost: 0, roles: [] });
  }

  // When a project is freshly created, land here with the plan already generated —
  // no manual "Plan with AI" click needed. Only fires once, and only for a project
  // that has no tasks yet (so it doesn't re-trigger on an already-planned project).
  useEffect(() => {
    if (autoPlan && !autoTriggered.current && detail.tasks.length === 0 && goal.trim()) {
      autoTriggered.current = true;
      generatePlan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlan]);

  function updateTaskHours(index: number, hours: number) {
    setEditedTasks((prev) => prev.map((t, i) => (i === index ? { ...t, estimateHours: hours } : t)));
  }

  const editedTotalHours = editedTasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0);
  const laborCost = editedTasks.reduce((sum, t) => sum + (t.estimateHours ?? 0) * (t.rate ?? 75), 0);
  const materialCostTotal = materialCosts.reduce((sum, m) => sum + (m.amount ?? 0), 0);
  const contingencyAmount = Math.round(((laborCost + materialCostTotal) * contingencyPercent) / 100);
  const totalProjectBudget = Math.round(laborCost + materialCostTotal + contingencyAmount);

  function updateMaterialCost<K extends keyof MaterialCostItem>(index: number, key: K, value: MaterialCostItem[K]) {
    setMaterialCosts((prev) => prev.map((m, i) => (i === index ? { ...m, [key]: value } : m)));
  }
  function addMaterialCost() {
    setMaterialCosts((prev) => [...prev, { name: "", amount: 0, cadence: "one-time", notes: "" }]);
  }
  function removeMaterialCost(index: number) {
    setMaterialCosts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateOngoingRole(index: number, key: keyof OngoingSupportRole, value: string | number) {
    setOngoingSupport((prev) => ({
      ...prev,
      roles: prev.roles.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    }));
  }
  function addOngoingRole() {
    setOngoingSupport((prev) => ({ ...prev, roles: [...prev.roles, { role: "", hoursPerWeek: 0 }] }));
  }
  function removeOngoingRole(index: number) {
    setOngoingSupport((prev) => ({ ...prev, roles: prev.roles.filter((_, i) => i !== index) }));
  }

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
        budgetPlanned: totalProjectBudget,
        contingencyPercent,
        materialCosts,
        ongoingSupport,
        executionMethodology: methodology,
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
    setMaterialCosts([]);
    setOngoingSupport({ summary: "", monthlyCost: 0, roles: [] });
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

  function entriesForTask(taskId: string) {
    return (detail.timeEntries ?? []).filter((e) => e.taskId === taskId);
  }

  function toggleTimeLog(taskId: string) {
    setOpenTimeLogTaskId((prev) => (prev === taskId ? null : taskId));
    setTimeLogForm({ hours: 0, entryDate: formatDateInput(new Date()), notes: "" });
  }

  async function logTime(taskId: string) {
    if (!timeLogForm.hours || timeLogForm.hours <= 0) return;
    setLoggingTime(true);
    await fetch(`/api/projects/${detail.project.id}/tasks/${taskId}/time-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(timeLogForm),
    });
    setLoggingTime(false);
    setTimeLogForm({ hours: 0, entryDate: formatDateInput(new Date()), notes: "" });
    router.refresh();
  }

  async function deleteTimeEntry(taskId: string, entryId: string) {
    await fetch(`/api/projects/${detail.project.id}/tasks/${taskId}/time-entries/${entryId}`, { method: "DELETE" });
    router.refresh();
  }

  const agentTasks = detail.tasks.filter((t) => t.isAgentTask);
  const regularTasks = detail.tasks.filter((t) => !t.isAgentTask);

  const sorted = [...regularTasks].sort((a, b) => {
    const order = { BLOCKED: 0, IN_PROGRESS: 1, TODO: 2, DONE: 3 } as Record<string, number>;
    return order[a.status] - order[b.status];
  });

  const phaseGroups = (() => {
    const byPhase = new Map<string, typeof regularTasks>();
    for (const t of regularTasks) {
      const key = t.phase ?? "Unphased";
      if (!byPhase.has(key)) byPhase.set(key, []);
      byPhase.get(key)!.push(t);
    }
    return [...byPhase.entries()].map(([phase, phaseTasks]) => ({
      phase,
      tasks: phaseTasks,
      done: phaseTasks.filter((t) => t.status === "DONE").length,
    }));
  })();

  return (
    <div className="max-w-4xl space-y-4">
      <Card title="Execution Methodology">
        <p className="text-xs text-slate-400 mb-3">
          How this project is executed day-to-day — affects how the AI planner structures the work below.
          The Delivery &amp; Pricing tab may also recommend one of these based on the project&apos;s
          characteristics.
        </p>
        <div className="max-w-sm">
          <Field label="Methodology">
            <select
              value={methodology}
              onChange={(e) => updateMethodology(e.target.value)}
              disabled={savingMethodology}
              className={inputCls}
            >
              {Object.entries(METHODOLOGY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

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
          Pick the kind of project, describe the goal, and the AI PM drafts milestones across the full
          lifecycle for that kind of work, estimates effort and cost per role, and suggests a start/end
          date. Nothing is created until you review and approve it below.
        </p>
        {showPlanner && (
          <div className="p-4 bg-slate-50 rounded-lg space-y-3">
            <Field label="Project type">
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)} className={inputCls}>
                {Object.entries(PROJECT_TYPES).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Goal">
              <textarea value={goal} onChange={(e) => setGoal(e.target.value)} className={inputCls} rows={3} />
            </Field>
            <Field label={typeConfig.approachLabel}>
              <input
                value={approach}
                onChange={(e) => setApproach(e.target.value)}
                className={inputCls}
                placeholder={typeConfig.approachPlaceholder}
              />
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
                {preview.approach && (
                  <div className="border border-indigo-200 bg-indigo-50/60 rounded-lg p-3">
                    <p className="text-xs font-semibold text-indigo-900 mb-1">
                      {approach.trim() ? "Approach" : "AI-recommended approach"}: {preview.approach.summary}
                    </p>
                    {preview.approach.details && (
                      <p className="text-[11px] text-indigo-700">
                        {Object.entries(preview.approach.details)
                          .map(([label, value]) => `${label}: ${value}`)
                          .join(" · ")}
                      </p>
                    )}
                    {preview.approach.rationale && (
                      <p className="text-[11px] text-indigo-600 mt-1">{preview.approach.rationale}</p>
                    )}
                    {!approach.trim() && (
                      <p className="text-[10px] text-indigo-500 mt-1.5">
                        Don&apos;t agree? Set a preferred approach above and click Generate plan again.
                      </p>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <SummaryStat label="Total effort" value={`${editedTotalHours.toFixed(0)} hrs`} />
                  <SummaryStat label="Total project budget" value={`$${totalProjectBudget.toLocaleString()}`} />
                  <SummaryStat label="Duration" value={`${Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))} days`} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-200">
                        <th className="py-1.5 font-medium">Role</th>
                        <th className="py-1.5 font-medium">Skills needed</th>
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
                          <td className="py-1.5 text-slate-500">
                            {r.requiredSkills.length ? (
                              <div className="flex flex-wrap gap-1 max-w-[180px]">
                                {r.requiredSkills.map((s) => (
                                  <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
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
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Plan by phase</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {preview.phaseBreakdown.map((p) => (
                      <div key={p.phase} className="border border-slate-200 rounded-lg p-2 text-center">
                        <p className="text-[10px] text-slate-400">{phaseLabel(p.phase)}</p>
                        <p className="text-sm font-semibold text-slate-800">{p.taskCount} tasks</p>
                        <p className="text-[10px] text-slate-500">{p.hours}h · ${p.cost.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Tasks — adjust hours if needed</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-200">
                        <th className="py-1.5 font-medium">Phase</th>
                        <th className="py-1.5 font-medium">Task</th>
                        <th className="py-1.5 font-medium">Role</th>
                        <th className="py-1.5 font-medium">Skills / Experience</th>
                        <th className="py-1.5 font-medium text-right">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editedTasks.map((t, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-1.5 text-slate-400">{phaseLabel(t.phase ?? "")}</td>
                          <td className="py-1.5 text-slate-700">{t.title}</td>
                          <td className="py-1.5 text-slate-500">
                            {t.resolvedAssigneeName ?? t.suggestedRole ?? "—"}
                          </td>
                          <td className="py-1.5 text-slate-500">
                            <div className="flex flex-wrap items-center gap-1 max-w-[220px]">
                              {(t.requiredSkills ?? []).map((s) => (
                                <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                  {s}
                                </span>
                              ))}
                              {t.requiredExperienceYears != null && (
                                <span className="text-[10px] text-slate-400">{t.requiredExperienceYears}+ yrs</span>
                              )}
                              {!(t.requiredSkills ?? []).length && t.requiredExperienceYears == null && "—"}
                            </div>
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
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Budget breakdown</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <SummaryStat label="Labor cost" value={`$${laborCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                    <SummaryStat label="Material costs" value={`$${materialCostTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
                    <SummaryStat label={`Contingency (${contingencyPercent}%)`} value={`$${contingencyAmount.toLocaleString()}`} />
                    <SummaryStat label="Total budget" value={`$${totalProjectBudget.toLocaleString()}`} />
                  </div>
                  <div className="mt-2 max-w-[200px]">
                    <Field label="Contingency %">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={contingencyPercent}
                        onChange={(e) => setContingencyPercent(Number(e.target.value))}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-slate-700">
                      Material costs — licenses, servers, other one-time/recurring items
                    </p>
                    <button
                      onClick={addMaterialCost}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                    >
                      <Plus size={12} /> Add item
                    </button>
                  </div>
                  {materialCosts.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-400 border-b border-slate-200">
                          <th className="py-1.5 font-medium">Name</th>
                          <th className="py-1.5 font-medium text-right">Amount</th>
                          <th className="py-1.5 font-medium">Cadence</th>
                          <th className="py-1.5 font-medium">Notes</th>
                          <th className="py-1.5 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {materialCosts.map((m, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0">
                            <td className="py-1.5">
                              <input
                                value={m.name}
                                onChange={(e) => updateMaterialCost(i, "name", e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded px-1.5 py-1"
                                placeholder="e.g. Salesforce licenses"
                              />
                            </td>
                            <td className="py-1.5 text-right">
                              <input
                                type="number"
                                min={0}
                                value={m.amount}
                                onChange={(e) => updateMaterialCost(i, "amount", Number(e.target.value))}
                                className="w-24 text-right text-xs border border-slate-200 rounded px-1.5 py-1"
                              />
                            </td>
                            <td className="py-1.5">
                              <select
                                value={m.cadence}
                                onChange={(e) => updateMaterialCost(i, "cadence", e.target.value)}
                                className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white"
                              >
                                <option value="one-time">One-time</option>
                                <option value="monthly">Monthly</option>
                                <option value="annual">Annual</option>
                              </select>
                            </td>
                            <td className="py-1.5">
                              <input
                                value={m.notes ?? ""}
                                onChange={(e) => updateMaterialCost(i, "notes", e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded px-1.5 py-1"
                                placeholder="optional"
                              />
                            </td>
                            <td className="py-1.5 text-right">
                              <button onClick={() => removeMaterialCost(i)} className="text-slate-400 hover:text-rose-600">
                                <X size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">No material costs — add licenses, servers, or other costs if needed.</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Amounts shown as a total for the project duration, even for recurring items. Included in the total
                    project budget above (before contingency).
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Ongoing support — cost to keep this running after launch</p>
                  <Field label="Summary">
                    <textarea
                      value={ongoingSupport.summary}
                      onChange={(e) => setOngoingSupport((prev) => ({ ...prev, summary: e.target.value }))}
                      className={inputCls}
                      rows={2}
                      placeholder="e.g. Part-time maintenance for bug fixes, monitoring, and minor enhancements"
                    />
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    <Field label="Estimated monthly cost">
                      <input
                        type="number"
                        min={0}
                        value={ongoingSupport.monthlyCost}
                        onChange={(e) => setOngoingSupport((prev) => ({ ...prev, monthlyCost: Number(e.target.value) }))}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-slate-600">Support roles needed</p>
                      <button
                        onClick={addOngoingRole}
                        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                      >
                        <Plus size={12} /> Add role
                      </button>
                    </div>
                    {ongoingSupport.roles.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 mb-1.5">
                        <input
                          value={r.role}
                          onChange={(e) => updateOngoingRole(i, "role", e.target.value)}
                          className="flex-1 text-xs border border-slate-200 rounded px-1.5 py-1"
                          placeholder="e.g. Salesforce admin"
                        />
                        <input
                          type="number"
                          min={0}
                          value={r.hoursPerWeek ?? 0}
                          onChange={(e) => updateOngoingRole(i, "hoursPerWeek", Number(e.target.value))}
                          className="w-20 text-right text-xs border border-slate-200 rounded px-1.5 py-1"
                        />
                        <span className="text-[10px] text-slate-400">hrs/wk</span>
                        <button onClick={() => removeOngoingRole(i)} className="text-slate-400 hover:text-rose-600">
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Tracked as an ongoing operational cost, separate from the one-time project budget above.
                  </p>
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
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setTaskView("list")}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 ${taskView === "list" ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
              >
                <List size={13} /> List
              </button>
              <button
                onClick={() => setTaskView("phase")}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 border-l border-slate-200 ${taskView === "phase" ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
              >
                <LayoutGrid size={13} /> By Phase
              </button>
            </div>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            >
              <Plus size={14} /> Add Task
            </button>
          </div>
        }
      >
        {showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="border border-indigo-100 bg-indigo-50/60 rounded-lg p-3 space-y-2">
              <Field label="Describe the task (one line is fine) — AI drafts the fields below">
                <textarea
                  value={taskDraftNote}
                  onChange={(e) => setTaskDraftNote(e.target.value)}
                  className={inputCls}
                  rows={2}
                  placeholder="e.g. need to set up the staging environment before the demo next week"
                />
              </Field>
              <button
                onClick={draftTaskWithAI}
                disabled={draftingTask || !taskDraftNote.trim()}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {draftingTask ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {draftingTask ? "Drafting..." : "Draft with AI"}
              </button>
              {taskDraftError && <p className="text-xs text-rose-600">{taskDraftError}</p>}
            </div>
            <Field label="Title">
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

        {taskView === "phase" && (
          <div className="space-y-2 mb-2">
            {phaseGroups.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No tasks yet.</p>}
            {phaseGroups.map(({ phase, tasks: phaseTasks, done }) => (
              <div key={phase} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-700">{phaseLabel(phase)}</p>
                  <p className="text-[11px] text-slate-400">{done}/{phaseTasks.length} done</p>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${phaseTasks.length ? Math.round((done / phaseTasks.length) * 100) : 0}%` }}
                  />
                </div>
                <div className="space-y-1">
                  {phaseTasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs">
                      <span className={t.status === "DONE" ? "text-slate-400 line-through" : "text-slate-700"}>{t.title}</span>
                      <span className="text-slate-400">{t.status.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {taskView === "list" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 font-medium">Task</th>
              <th className="py-2 font-medium">Assignee</th>
              <th className="py-2 font-medium">Priority</th>
              <th className="py-2 font-medium">Due</th>
              <th className="py-2 font-medium text-right">Hours</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const entries = entriesForTask(t.id);
              const over = (t.actualHours ?? 0) > (t.estimateHours ?? 0) && (t.estimateHours ?? 0) > 0;
              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-800">
                      {t.title}
                      {t.createdByAi && <span className="ml-1.5 text-[10px] text-indigo-500 align-middle">AI</span>}
                    </td>
                    <td className="py-2.5 text-slate-600">{resourceName(t.assigneeId)}</td>
                    <td className="py-2.5"><PriorityBadge priority={t.priority} /></td>
                    <td className="py-2.5 text-slate-600">{formatDate(t.dueDate)}</td>
                    <td className={`py-2.5 text-right ${over ? "text-rose-600" : "text-slate-600"}`}>
                      {(t.actualHours ?? 0).toFixed(1)}/{(t.estimateHours ?? 0).toFixed(0)}h
                    </td>
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
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleTimeLog(t.id)}
                          title="Log time / view effort history"
                          className={`hover:text-indigo-600 ${openTimeLogTaskId === t.id ? "text-indigo-600" : "text-slate-400"}`}
                        >
                          <Clock size={14} />
                        </button>
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
                      </div>
                    </td>
                  </tr>
                  {openTimeLogTaskId === t.id && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={7} className="py-3 px-2">
                        <div className="flex items-end gap-2 mb-2">
                          <Field label="Hours">
                            <input
                              type="number"
                              min={0}
                              step={0.25}
                              value={timeLogForm.hours}
                              onChange={(e) => setTimeLogForm((f) => ({ ...f, hours: Number(e.target.value) }))}
                              className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1"
                            />
                          </Field>
                          <Field label="Date">
                            <input
                              type="date"
                              value={timeLogForm.entryDate}
                              onChange={(e) => setTimeLogForm((f) => ({ ...f, entryDate: e.target.value }))}
                              className="text-xs border border-slate-200 rounded px-1.5 py-1"
                            />
                          </Field>
                          <Field label="Notes">
                            <input
                              value={timeLogForm.notes}
                              onChange={(e) => setTimeLogForm((f) => ({ ...f, notes: e.target.value }))}
                              className="text-xs border border-slate-200 rounded px-1.5 py-1 w-40"
                              placeholder="optional"
                            />
                          </Field>
                          <button
                            onClick={() => logTime(t.id)}
                            disabled={loggingTime}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {loggingTime ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                            Log
                          </button>
                        </div>
                        {entries.length > 0 ? (
                          <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-left text-slate-400 border-b border-slate-200">
                                <th className="py-1 font-medium">Date</th>
                                <th className="py-1 font-medium text-right">Hours</th>
                                <th className="py-1 font-medium">Notes</th>
                                <th className="py-1 font-medium"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {entries.map((e) => (
                                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                                  <td className="py-1 text-slate-600">{formatDate(e.entryDate)}</td>
                                  <td className="py-1 text-right text-slate-700">{e.hours}h</td>
                                  <td className="py-1 text-slate-500">{e.notes ?? "—"}</td>
                                  <td className="py-1 text-right">
                                    <button onClick={() => deleteTimeEntry(t.id, e.id)} className="text-slate-400 hover:text-rose-600">
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            </table>
        </div>
                        ) : (
                          <p className="text-[11px] text-slate-400">No time logged yet for this task.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">No tasks yet.</td></tr>
            )}
          </tbody>
        </table>
        </div>
        )}
      </Card>

      {methodology !== "WATERFALL" && (
        <SprintBoard detail={detail} allResources={allResources} />
      )}
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
