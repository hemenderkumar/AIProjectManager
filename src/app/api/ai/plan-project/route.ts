import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, milestones, resources, projects } from "@/lib/db/schema";
import { askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";

const PHASES = ["PLANNING", "DESIGN", "DEVELOPMENT", "TESTING", "DEPLOYMENT"] as const;
type Phase = (typeof PHASES)[number];

interface PlanTask {
  title: string;
  description?: string;
  estimateHours?: number;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedRole?: string;
  suggestedHourlyRate?: number;
  phase?: Phase;
  dueInDays?: number;
}

interface PlanMilestone {
  name: string;
  phase?: Phase;
  dueInDays?: number;
}

interface PlanFollowUp {
  title: string;
  description?: string;
  dueInDays?: number;
}

interface ProjectPlan {
  milestones: PlanMilestone[];
  tasks: PlanTask[];
  agentFollowUps: PlanFollowUp[];
}

type Resource = {
  id: string;
  name: string;
  role: string | null;
  capacityHoursPerWk: number | null;
  costPerHour: number | null;
};

const DEFAULT_WEEKLY_CAPACITY = 40; // fallback hrs/wk if we can't match any real resource
const DEFAULT_HOURLY_RATE = 75; // fallback $/hr for roles with no matching resource and no AI suggestion

function matchResource(allResources: Resource[], suggestedRole?: string): Resource | null {
  if (!suggestedRole) return null;
  const needle = suggestedRole.toLowerCase();
  const match = allResources.find(
    (r) =>
      r.role !== "AI Project Manager" &&
      (r.role?.toLowerCase().includes(needle) || needle.includes((r.role ?? "").toLowerCase()))
  );
  return match ?? null;
}

// Given a set of tasks (with estimateHours + resolved assignee), work out a realistic
// duration: total effort divided by the combined weekly capacity of everyone involved,
// with a minimum of 1 week and rounded up to a whole number of days.
function estimateSchedule(planTasks: PlanTask[], allResources: Resource[]) {
  const totalEffortHours = planTasks.reduce((sum, t) => sum + (t.estimateHours ?? 8), 0);

  const involvedCapacities = new Set<number>();
  for (const t of planTasks) {
    const match = matchResource(allResources, t.suggestedRole);
    involvedCapacities.add(match?.capacityHoursPerWk ?? DEFAULT_WEEKLY_CAPACITY);
  }
  const combinedWeeklyCapacity =
    [...involvedCapacities].reduce((a, b) => a + b, 0) || DEFAULT_WEEKLY_CAPACITY;

  const weeksNeeded = Math.max(1, Math.ceil(totalEffortHours / combinedWeeklyCapacity));
  const durationDays = weeksNeeded * 7;

  const today = new Date();
  const suggestedStartDate = today;
  const suggestedEndDate = new Date(today.getTime() + durationDays * 86400000);

  return { totalEffortHours, combinedWeeklyCapacity, suggestedStartDate, suggestedEndDate };
}

function rateForTask(t: PlanTask, allResources: Resource[]): number {
  const match = matchResource(allResources, t.suggestedRole);
  if (match?.costPerHour) return match.costPerHour;
  if (t.suggestedHourlyRate) return t.suggestedHourlyRate;
  return DEFAULT_HOURLY_RATE;
}

// Group tasks by suggested role -> total hours, blended cost, and whether an existing
// team member covers it or it's a staffing gap that needs to be filled/hired.
function buildTeamComposition(planTasks: PlanTask[], allResources: Resource[]) {
  const byRole = new Map<
    string,
    { role: string; hours: number; rate: number; matchedResourceName: string | null }
  >();

  for (const t of planTasks) {
    const role = t.suggestedRole?.trim() || "Unspecified role";
    const match = matchResource(allResources, t.suggestedRole);
    const rate = rateForTask(t, allResources);
    const existing = byRole.get(role);
    if (existing) {
      existing.hours += t.estimateHours ?? 8;
    } else {
      byRole.set(role, {
        role,
        hours: t.estimateHours ?? 8,
        rate,
        matchedResourceName: match?.name ?? null,
      });
    }
  }

  return [...byRole.values()]
    .map((r) => ({ ...r, cost: Math.round(r.hours * r.rate) }))
    .sort((a, b) => b.hours - a.hours);
}

function buildPhaseBreakdown(planTasks: PlanTask[], allResources: Resource[]) {
  const byPhase = new Map<Phase, { phase: Phase; hours: number; cost: number; taskCount: number }>();
  for (const p of PHASES) byPhase.set(p, { phase: p, hours: 0, cost: 0, taskCount: 0 });

  for (const t of planTasks) {
    const phase: Phase = t.phase && PHASES.includes(t.phase) ? t.phase : "DEVELOPMENT";
    const bucket = byPhase.get(phase)!;
    const hours = t.estimateHours ?? 8;
    bucket.hours += hours;
    bucket.cost += Math.round(hours * rateForTask(t, allResources));
    bucket.taskCount += 1;
  }

  return [...byPhase.values()].filter((b) => b.taskCount > 0);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { projectId, confirm } = body;
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const allResources = await db.select().from(resources);

  // ---- CONFIRM STEP: actually write the (possibly user-edited) plan to the DB ----
  if (confirm) {
    const plan: ProjectPlan = body.plan;
    const startDate: string | undefined = body.startDate;
    const targetEndDate: string | undefined = body.targetEndDate;
    const budgetPlanned: number | undefined = body.budgetPlanned;

    if (!plan) {
      return NextResponse.json({ error: "plan is required when confirming" }, { status: 400 });
    }

    const today = new Date();
    const addDays = (n: number) => new Date(today.getTime() + (n ?? 7) * 86400000);

    const createdMilestones = plan.milestones?.length
      ? await db
          .insert(milestones)
          .values(
            plan.milestones.map((m) => ({
              projectId,
              name: m.phase ? `[${m.phase}] ${m.name}` : m.name,
              dueDate: addDays(m.dueInDays ?? 14),
            }))
          )
          .returning()
      : [];

    const createdTasks = plan.tasks?.length
      ? await db
          .insert(tasks)
          .values(
            plan.tasks.map((t) => ({
              projectId,
              title: t.phase ? `[${t.phase}] ${t.title}` : t.title,
              description: t.description ?? null,
              priority: t.priority ?? "MEDIUM",
              estimateHours: t.estimateHours ?? 8,
              assigneeId: matchResource(allResources, t.suggestedRole)?.id ?? null,
              dueDate: addDays(t.dueInDays ?? 14),
              createdByAi: true,
            }))
          )
          .returning()
      : [];

    const aiPmResource = allResources.find((r) => r.role === "AI Project Manager");
    const createdFollowUps =
      plan.agentFollowUps?.length && aiPmResource
        ? await db
            .insert(tasks)
            .values(
              plan.agentFollowUps.map((f) => ({
                projectId,
                title: f.title,
                description: f.description ?? null,
                priority: "MEDIUM" as const,
                assigneeId: aiPmResource.id,
                dueDate: addDays(f.dueInDays ?? 7),
                isAgentTask: true,
                createdByAi: true,
              }))
            )
            .returning()
        : [];

    if (startDate || targetEndDate || budgetPlanned !== undefined) {
      await db
        .update(projects)
        .set({
          ...(startDate ? { startDate: new Date(startDate) } : {}),
          ...(targetEndDate ? { targetEndDate: new Date(targetEndDate) } : {}),
          ...(budgetPlanned !== undefined ? { budgetPlanned } : {}),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
    }

    return NextResponse.json({
      milestones: createdMilestones,
      tasks: createdTasks,
      agentFollowUps: createdFollowUps,
    });
  }

  // ---- PREVIEW STEP: ask AI for a plan, estimate schedule + cost, but write nothing yet ----
  const { goal, targetDays } = body;
  if (!goal) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const resourceList = allResources
    .filter((r) => r.role !== "AI Project Manager")
    .map(
      (r) =>
        `${r.name} (${r.role ?? "no role set"}, ${r.capacityHoursPerWk ?? 40} hrs/wk capacity, $${
          r.costPerHour ?? "?"
        }/hr)`
    )
    .join("\n");

  const system = `You are an experienced AI project manager and delivery estimator. Given a project goal,
produce a realistic, end-to-end work breakdown structure covering the FULL delivery lifecycle — not just
build work. Every task must be tagged with a phase from this fixed list: ${PHASES.join(", ")}.
Always include real Testing tasks (QA, user acceptance testing, bug fixing) and real Deployment tasks
(release/cutover, monitoring setup, handover/documentation) — do not skip these phases even if the goal
description only talks about building something.

For each task, also suggest a role (pick from the team roster below if a good fit, otherwise a generic
role like "Backend Engineer", "QA Engineer", "DevOps Engineer") and, ONLY if that role doesn't reasonably
match anyone on the roster, include a suggestedHourlyRate (a realistic USD market rate for that role/skill
level — e.g. 40-60 for junior/QA, 70-110 for mid/senior engineering, 90-160 for specialized/lead roles).
Do not include suggestedHourlyRate for roles that clearly match an existing team member.

Team roster:
${resourceList || "No team members yet — suggest generic roles and realistic market rates for each."}

Also list 2-4 follow-up actions YOU (the AI PM) will own — things like "check in with X on Y" or "prepare
steering committee update" — not delivery work; these don't need a phase or role.

Output strict JSON matching this shape exactly:
{
  "milestones": [{ "name": string, "phase": "PLANNING"|"DESIGN"|"DEVELOPMENT"|"TESTING"|"DEPLOYMENT", "dueInDays": number }],
  "tasks": [{ "title": string, "description": string, "estimateHours": number, "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "suggestedRole": string, "suggestedHourlyRate": number, "phase": "PLANNING"|"DESIGN"|"DEVELOPMENT"|"TESTING"|"DEPLOYMENT", "dueInDays": number }],
  "agentFollowUps": [{ "title": string, "description": string, "dueInDays": number }]
}
Keep it to 5-8 milestones (spread across all phases) and 10-20 tasks (spread across all phases, with
real coverage of testing and deployment work, not just 1 token task). Be realistic and conservative
with estimateHours and rates — these numbers drive the actual schedule and budget the user will approve.
dueInDays is relative to today, and should increase roughly in phase order (planning/design due sooner,
deployment due latest).`;

  const user_prompt = `Project goal: ${goal}\nTarget completion: ${targetDays ? `${targetDays} days from now` : "not specified, use your judgment"}`;

  const plan = await askClaudeJSON<ProjectPlan>(system, user_prompt);
  if (!plan) {
    return NextResponse.json(
      { error: "AI planning is not available. Add ANTHROPIC_API_KEY to enable it, or the model returned an unparseable response." },
      { status: 503 }
    );
  }

  const planTasks = plan.tasks ?? [];
  const schedule = estimateSchedule(planTasks, allResources);
  const teamComposition = buildTeamComposition(planTasks, allResources);
  const phaseBreakdown = buildPhaseBreakdown(planTasks, allResources);
  const totalEstimatedCost = teamComposition.reduce((sum, r) => sum + r.cost, 0);

  const tasksWithAssignee = planTasks.map((t) => ({
    ...t,
    phase: t.phase && PHASES.includes(t.phase) ? t.phase : "DEVELOPMENT",
    rate: rateForTask(t, allResources),
    resolvedAssigneeName: matchResource(allResources, t.suggestedRole)?.name ?? null,
  }));

  return NextResponse.json({
    preview: true,
    plan: { ...plan, tasks: tasksWithAssignee },
    totalEffortHours: schedule.totalEffortHours,
    combinedWeeklyCapacity: schedule.combinedWeeklyCapacity,
    suggestedStartDate: schedule.suggestedStartDate.toISOString().slice(0, 10),
    suggestedEndDate: schedule.suggestedEndDate.toISOString().slice(0, 10),
    teamComposition,
    phaseBreakdown,
    totalEstimatedCost,
  });
}
