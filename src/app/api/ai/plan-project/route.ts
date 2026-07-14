import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, milestones, resources, projects, costItems, sprints } from "@/lib/db/schema";
import { askClaudeJSON } from "@/lib/ai";
import { requireProjectAccess } from "@/lib/tenancy";
import { syncAllocationsFromEffort } from "@/lib/allocations";

// Different kinds of projects go through very different lifecycles. Each project
// type defines its own phase list and its own guidance for what "the approach" even
// means (a tech stack for software, a methodology for research, materials/permits
// for physical work).
const PROJECT_TYPES = {
  TECHNOLOGY: {
    label: "Technology / Software",
    phases: ["SCOPING", "REQUIREMENTS", "DESIGN", "DEVELOPMENT", "TESTING", "UAT", "DEPLOYMENT"] as const,
    approachNoun: "technology stack",
    approachLabel: "Preferred technology stack (optional)",
    approachPlaceholder: "e.g. React + Node.js + PostgreSQL — leave blank and the AI PM will recommend one",
    guidance: `Always include real Scoping tasks (defining boundaries, high-level estimate), Requirements
tasks (detailed functional/non-functional requirements gathering and sign-off), Testing tasks (QA, bug
fixing), UAT tasks (user acceptance testing sessions and sign-off, distinct from internal QA), and
Deployment tasks (release/cutover, monitoring setup, handover/documentation) — do not skip any of these
phases even if the goal description only talks about building something. For each task, suggest a
specific, technology-appropriate role (e.g. "React Frontend Developer", "Node.js Backend Engineer", "QA
Engineer", "DevOps Engineer"), not a vague placeholder.`,
  },
  RESEARCH: {
    label: "Research",
    phases: ["PLANNING", "RESEARCH", "ANALYSIS", "REPORTING", "REVIEW"] as const,
    approachNoun: "research approach/methodology",
    approachLabel: "Preferred research approach or methodology (optional)",
    approachPlaceholder: "e.g. mixed-methods survey + literature review — leave blank and the AI PM will recommend one",
    guidance: `Always include real tasks for literature/background review, methodology or study design,
data or source collection, analysis, drafting findings, and stakeholder/peer review — do not skip any of
these even if the goal description is brief. Suggest specific roles (e.g. "Research Analyst", "Data
Analyst", "Subject Matter Expert", "Editor/Reviewer"), not vague placeholders.`,
  },
  HANDYMAN: {
    label: "Handyman / Physical / Construction",
    phases: ["PLANNING", "PROCUREMENT", "EXECUTION", "INSPECTION", "COMPLETION"] as const,
    approachNoun: "materials and approach",
    approachLabel: "Preferred materials or approach (optional)",
    approachPlaceholder: "e.g. hardwood flooring, standard building permits — leave blank and the AI PM will recommend one",
    guidance: `Always include real tasks for site assessment/measurements, permits or approvals if relevant,
sourcing materials and tools, the on-site labor itself, safety checks, final inspection/sign-off, and
cleanup/handover — do not skip these even if the goal description is brief. Suggest specific roles (e.g.
"Site Lead", "Electrician", "Carpenter", "Inspector"), not vague placeholders.`,
  },
  GENERAL: {
    label: "General / Other",
    phases: ["PLANNING", "EXECUTION", "REVIEW", "COMPLETION"] as const,
    approachNoun: "overall approach",
    approachLabel: "Preferred approach or constraints (optional)",
    approachPlaceholder: "Describe any specific approach, tools, or constraints, or leave blank",
    guidance: `Break the work into sensible, concrete stages appropriate for this kind of project, and
suggest specific roles appropriate to the work involved, not vague placeholders.`,
  },
} as const;

type ProjectTypeKey = keyof typeof PROJECT_TYPES;

interface PlanTask {
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
  sprintName?: string;
  storyPoints?: number;
  executionSource?: "AI" | "INTERNAL" | "VENDOR";
}

interface PlanMilestone {
  name: string;
  phase?: string;
  dueInDays?: number;
}

interface PlanFollowUp {
  title: string;
  description?: string;
  dueInDays?: number;
}

interface ApproachRecommendation {
  summary: string;
  details?: Record<string, string>;
  rationale?: string;
}

interface MaterialCostItem {
  name: string;
  amount?: number;
  cadence?: string; // e.g. "one-time", "monthly", "annual" — informational; amount should already be sized for the project
  notes?: string;
}

interface OngoingSupportRole {
  role: string;
  hoursPerWeek?: number;
}

interface OngoingSupportPlan {
  summary: string;
  monthlyCost?: number;
  roles?: OngoingSupportRole[];
}

interface ProjectPlan {
  milestones: PlanMilestone[];
  tasks: PlanTask[];
  agentFollowUps: PlanFollowUp[];
  approach?: ApproachRecommendation;
  materialCosts?: MaterialCostItem[];
  ongoingSupport?: OngoingSupportPlan;
}

type Resource = {
  id: string;
  name: string;
  role: string | null;
  capacityHoursPerWk: number | null;
  costPerHour: number | null;
  skills: string[] | null;
  experienceYears: number | null;
};

const DEFAULT_WEEKLY_CAPACITY = 40; // fallback hrs/wk if we can't match any real resource
const DEFAULT_HOURLY_RATE = 75; // fallback $/hr for roles with no matching resource and no AI suggestion

// Counts how many of a task's required skills a resource actually has (fuzzy, case-insensitive
// substring match in both directions so "React" matches "React.js" and vice versa).
function skillOverlapCount(resourceSkills: string[] | null, requiredSkills?: string[]): number {
  if (!requiredSkills?.length || !resourceSkills?.length) return 0;
  const have = resourceSkills.map((s) => s.toLowerCase().trim());
  const need = requiredSkills.map((s) => s.toLowerCase().trim());
  return need.filter((n) => have.some((h) => h.includes(n) || n.includes(h))).length;
}

// Finds the best-fit team member for a task. Skill overlap is weighted far above everything
// else — that's the whole point of tracking skills per resource — with experience level and
// legacy role-name matching as secondary signals so this still works for resources that don't
// have skills/experience filled in yet.
function matchResource(
  allResources: Resource[],
  suggestedRole?: string,
  requiredSkills?: string[],
  requiredExperienceYears?: number
): Resource | null {
  const candidates = allResources.filter((r) => r.role !== "AI Project Manager");
  const roleNeedle = suggestedRole?.toLowerCase().trim();

  let best: { resource: Resource; score: number } | null = null;
  for (const r of candidates) {
    let score = 0;

    const overlap = skillOverlapCount(r.skills, requiredSkills);
    score += overlap * 10;

    if (requiredExperienceYears != null && r.experienceYears != null) {
      score += r.experienceYears >= requiredExperienceYears ? 3 : -2;
    }

    if (roleNeedle && r.role) {
      const roleLower = r.role.toLowerCase();
      if (roleLower.includes(roleNeedle) || roleNeedle.includes(roleLower)) score += 1;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { resource: r, score };
    }
  }

  return best?.resource ?? null;
}

// Given a set of tasks (with estimateHours + resolved assignee), work out a realistic
// duration: total effort divided by the combined weekly capacity of everyone involved,
// with a minimum of 1 week and rounded up to a whole number of days.
function estimateSchedule(planTasks: PlanTask[], allResources: Resource[]) {
  const totalEffortHours = planTasks.reduce((sum, t) => sum + (t.estimateHours ?? 8), 0);

  const involvedCapacities = new Set<number>();
  for (const t of planTasks) {
    const match = matchResource(allResources, t.suggestedRole, t.requiredSkills, t.requiredExperienceYears);
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
  const match = matchResource(allResources, t.suggestedRole, t.requiredSkills, t.requiredExperienceYears);
  if (match?.costPerHour) return match.costPerHour;
  if (t.suggestedHourlyRate) return t.suggestedHourlyRate;
  return DEFAULT_HOURLY_RATE;
}

// Group tasks by suggested role -> total hours, blended cost, required skills, and whether
// an existing team member covers it or it's a staffing gap that needs to be filled/hired.
function buildTeamComposition(planTasks: PlanTask[], allResources: Resource[]) {
  type RoleRow = {
    role: string;
    hours: number;
    rate: number;
    matchedResourceName: string | null;
    requiredSkills: string[];
  };
  const byRole = new Map<string, RoleRow>();

  for (const t of planTasks) {
    const role = t.suggestedRole?.trim() || "Unspecified role";
    const match = matchResource(allResources, t.suggestedRole, t.requiredSkills, t.requiredExperienceYears);
    const rate = rateForTask(t, allResources);
    const existing = byRole.get(role);
    if (existing) {
      existing.hours += t.estimateHours ?? 8;
      for (const s of t.requiredSkills ?? []) {
        if (!existing.requiredSkills.includes(s)) existing.requiredSkills.push(s);
      }
    } else {
      byRole.set(role, {
        role,
        hours: t.estimateHours ?? 8,
        rate,
        matchedResourceName: match?.name ?? null,
        requiredSkills: [...(t.requiredSkills ?? [])],
      });
    }
  }

  return [...byRole.values()]
    .map((r) => ({ ...r, cost: Math.round(r.hours * r.rate) }))
    .sort((a, b) => b.hours - a.hours);
}

function buildPhaseBreakdown(planTasks: PlanTask[], allResources: Resource[], phases: readonly string[]) {
  const byPhase = new Map<string, { phase: string; hours: number; cost: number; taskCount: number }>();
  for (const p of phases) byPhase.set(p, { phase: p, hours: 0, cost: 0, taskCount: 0 });

  const fallbackPhase = phases[Math.min(2, phases.length - 1)] ?? phases[0];

  for (const t of planTasks) {
    const phase: string = t.phase && byPhase.has(t.phase) ? t.phase : fallbackPhase;
    const bucket = byPhase.get(phase)!;
    const hours = t.estimateHours ?? 8;
    bucket.hours += hours;
    bucket.cost += Math.round(hours * rateForTask(t, allResources));
    bucket.taskCount += 1;
  }

  return [...byPhase.values()].filter((b) => b.taskCount > 0);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, confirm } = body;
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allResources = await db.select().from(resources);

  // ---- CONFIRM STEP: actually write the (possibly user-edited) plan to the DB ----
  if (confirm) {
    const plan: ProjectPlan = body.plan;
    const startDate: string | undefined = body.startDate;
    const targetEndDate: string | undefined = body.targetEndDate;
    const budgetPlanned: number | undefined = body.budgetPlanned;
    const contingencyPercent: number | undefined = body.contingencyPercent;
    const materialCosts: MaterialCostItem[] = Array.isArray(body.materialCosts) ? body.materialCosts : [];
    const ongoingSupport: OngoingSupportPlan | undefined = body.ongoingSupport;
    const executionMethodology: string = body.executionMethodology ?? "WATERFALL";

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

    // Scrum/Hybrid execution: group tasks into sprints (by the AI's sprintName grouping),
    // laid out as sequential 2-week windows from the project start date. Waterfall skips
    // this entirely — tasks are tracked by phase only.
    const sprintNameToId = new Map<string, string>();
    if (executionMethodology !== "WATERFALL" && plan.tasks?.length) {
      const uniqueSprintNames: string[] = [];
      for (const t of plan.tasks) {
        if (t.sprintName && !uniqueSprintNames.includes(t.sprintName)) uniqueSprintNames.push(t.sprintName);
      }
      if (uniqueSprintNames.length) {
        const sprintStart = startDate ? new Date(startDate) : today;
        const SPRINT_LENGTH_DAYS = 14;
        const createdSprints = await db
          .insert(sprints)
          .values(
            uniqueSprintNames.map((name, i) => {
              const sStart = new Date(sprintStart.getTime() + i * SPRINT_LENGTH_DAYS * 86400000);
              const sEnd = new Date(sStart.getTime() + SPRINT_LENGTH_DAYS * 86400000);
              return {
                projectId,
                name,
                startDate: sStart,
                endDate: sEnd,
                status: i === 0 ? ("ACTIVE" as const) : ("PLANNED" as const),
              };
            })
          )
          .returning();
        createdSprints.forEach((s) => sprintNameToId.set(s.name, s.id));
      }
    }

    const createdTasks = plan.tasks?.length
      ? await db
          .insert(tasks)
          .values(
            plan.tasks.map((t) => ({
              projectId,
              title: t.title,
              description: t.description ?? null,
              priority: t.priority ?? "MEDIUM",
              estimateHours: t.estimateHours ?? 8,
              requiredSkills: t.requiredSkills?.length ? t.requiredSkills : null,
              requiredExperienceYears: t.requiredExperienceYears ?? null,
              assigneeId:
                matchResource(allResources, t.suggestedRole, t.requiredSkills, t.requiredExperienceYears)?.id ?? null,
              dueDate: addDays(t.dueInDays ?? 14),
              createdByAi: true,
              phase: t.phase ?? null,
              sprintId: t.sprintName ? sprintNameToId.get(t.sprintName) ?? null : null,
              storyPoints: t.storyPoints ?? null,
              executionSource: t.executionSource ?? null,
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

    const createdCostItems = materialCosts.length
      ? await db
          .insert(costItems)
          .values(
            materialCosts.map((m) => ({
              projectId,
              category: "MATERIAL" as const,
              name: m.name,
              amount: m.amount ?? 0,
              isRecurring: (m.cadence ?? "one-time") !== "one-time",
              cadence: m.cadence ?? "one-time",
              notes: m.notes ?? null,
              createdByAi: true,
            }))
          )
          .returning()
      : [];

    if (ongoingSupport && (ongoingSupport.summary || ongoingSupport.monthlyCost)) {
      const rolesText = ongoingSupport.roles?.length
        ? ongoingSupport.roles.map((r) => `${r.role} (${r.hoursPerWeek ?? "?"} hrs/wk)`).join(", ")
        : "";
      await db.insert(costItems).values({
        projectId,
        category: "ONGOING_SUPPORT",
        name: "Ongoing support",
        amount: ongoingSupport.monthlyCost ?? 0,
        isRecurring: true,
        cadence: "monthly",
        notes: [ongoingSupport.summary, rolesText ? `Roles: ${rolesText}` : null].filter(Boolean).join(" — "),
        createdByAi: true,
      });
    }

    if (
      startDate ||
      targetEndDate ||
      budgetPlanned !== undefined ||
      contingencyPercent !== undefined ||
      ongoingSupport
    ) {
      await db
        .update(projects)
        .set({
          ...(startDate ? { startDate: new Date(startDate) } : {}),
          ...(targetEndDate ? { targetEndDate: new Date(targetEndDate) } : {}),
          ...(budgetPlanned !== undefined ? { budgetPlanned } : {}),
          ...(contingencyPercent !== undefined ? { contingencyPercent } : {}),
          ...(ongoingSupport
            ? {
                ongoingSupportMonthlyCost: ongoingSupport.monthlyCost ?? 0,
                ongoingSupportPlan: ongoingSupport.summary ?? null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
    }

    // Resource allocation % should reflect the effort actually assigned, not a manually
    // guessed number — sync it now that this batch of tasks (and possibly new dates) exist.
    await syncAllocationsFromEffort(projectId);

    return NextResponse.json({
      milestones: createdMilestones,
      tasks: createdTasks,
      agentFollowUps: createdFollowUps,
      costItems: createdCostItems,
    });
  }

  // ---- PREVIEW STEP: ask AI for a plan, estimate schedule + cost, but write nothing yet ----
  const { goal, targetDays, approach: preferredApproach } = body;
  const projectType: ProjectTypeKey =
    body.projectType && body.projectType in PROJECT_TYPES ? body.projectType : "TECHNOLOGY";
  const executionMethodology: string = body.executionMethodology ?? "WATERFALL";
  if (!goal) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const typeConfig = PROJECT_TYPES[projectType];
  const phases = typeConfig.phases;

  const resourceList = allResources
    .filter((r) => r.role !== "AI Project Manager")
    .map((r) => {
      const skillsPart = r.skills?.length ? `, skills: ${r.skills.join(", ")}` : "";
      const expPart = r.experienceYears != null ? `, ${r.experienceYears} yrs experience` : "";
      return `${r.name} (${r.role ?? "no role set"}, ${r.capacityHoursPerWk ?? 40} hrs/wk capacity, $${
        r.costPerHour ?? "?"
      }/hr${skillsPart}${expPart})`;
    })
    .join("\n");

  const system = `You are an experienced AI project manager and delivery estimator, currently planning a
${typeConfig.label} project. First decide the ${typeConfig.approachNoun}, then produce a realistic,
end-to-end work breakdown structure covering the FULL lifecycle for this kind of project — not just the
core work itself.

${typeConfig.approachNoun.toUpperCase()}:
${
  preferredApproach && String(preferredApproach).trim()
    ? `The user has specified a preference: "${preferredApproach}". Use this as the basis for your plan
(you may fill in reasonable gaps if the user's description doesn't cover everything). Reflect this choice
consistently in task titles, roles, and effort estimates — use specific terms from it, not generic
placeholders.`
    : `The user has not specified a preference — you must choose one yourself, based on the goal, that a
sensible team would actually pick for this kind of project. State your choice in the "approach" field and
use it consistently for task titles, roles, and effort estimates.`
}

Every task must be tagged with a phase from this fixed list: ${phases.join(", ")}.
${typeConfig.guidance}

EXECUTION METHODOLOGY: ${executionMethodology}.
${
  executionMethodology === "WATERFALL"
    ? `This project runs as a single sequential stage-gate pass through the phases above — do not assign
sprints or story points.`
    : executionMethodology === "SCRUM"
      ? `This project runs on Scrum. In ADDITION to a phase, group every task into a sprint by assigning
"sprintName" (e.g. "Sprint 1", "Sprint 2", ...) — group logically related, deliverable-sized work together,
ordered so earlier sprints deliver foundational work. Also give each task "storyPoints" using a
Fibonacci-like scale (1, 2, 3, 5, 8, 13) reflecting RELATIVE effort/complexity, not hours.`
      : `This project runs Hybrid: phases are still the high-level stage-gate structure, but within each
phase, group tasks into sprints by assigning "sprintName" (e.g. "Sprint 1", "Sprint 2", ...) for iterative
execution. Also give each task "storyPoints" using a Fibonacci-like scale (1, 2, 3, 5, 8, 13) reflecting
RELATIVE effort/complexity, not hours.`
}

For each task, also suggest a role (pick from the team roster below if a good fit, otherwise a specific
role appropriate to this project type and approach) and, ONLY if that role doesn't reasonably match anyone
on the roster, include a suggestedHourlyRate (a realistic USD market rate for that role/skill level — e.g.
25-45 for entry-level/manual labor, 40-60 for junior/QA/research assistant roles, 70-110 for
mid-senior/specialist roles, 90-160 for highly specialized/lead roles). Do not include suggestedHourlyRate
for roles that clearly match an existing team member.

For each task, ALSO include requiredSkills: 2-4 specific, concrete skills needed for that exact task (not
vague — e.g. "React", "PostgreSQL", "AWS Lambda" for a technology task; "survey design", "SPSS" for a
research task; "electrical wiring", "OSHA safety compliance" for a handyman task), consistent with the
chosen approach. Also include requiredExperienceYears: a realistic minimum years of experience for that
task (roughly 0-1 for entry-level/simple tasks, 2-4 for standard/independent work, 5-8 for senior/complex
work, 9+ for expert/lead-level work). Use the team roster's listed skills and experience (where present) to
judge realistic requirements and to prefer matching existing team members whose skills actually fit.

Team roster:
${resourceList || "No team members yet — suggest generic roles and realistic market rates for each."}

For each task, ALSO include executionSource: who/what should actually do this task -- "AI" if it's
something an AI could realistically do directly end-to-end with no human execution needed (drafting a
document, generating a report, summarizing/analyzing data, answering questions) -- use this sparingly, most
delivery work still needs a human; "VENDOR" if it clearly requires specialist external expertise, licensed
equipment, or a third-party product/service the internal team wouldn't have in-house (e.g. a licensed
electrician, a specialized security audit firm, a niche SaaS integration only its vendor can do); "INTERNAL"
for everything else -- the default for most hands-on delivery work the internal team does themselves.

Also list 2-4 follow-up actions YOU (the AI PM) will own — things like "check in with X on Y" or "prepare
steering committee update" — not delivery work; these don't need a phase or role.

ALSO estimate materialCosts: the non-labor, one-time costs this project needs beyond people's time —
software licenses, cloud/server hosting for the build, domain/SSL, third-party API or data costs, hardware,
permits/fees, materials (for physical work), etc. Only include items that genuinely apply to this specific
project — do not pad the list with generic line items that don't fit. Size each "amount" as the realistic
total cost for the project's duration (if something is a recurring monthly cost during the build, multiply
it out to a total; note the monthly figure in "notes" too). Leave materialCosts as an empty array if a
project genuinely has no material costs (e.g. a pure research or advisory engagement).

ALSO estimate ongoingSupport: what it will realistically take to support/operate this after delivery —
a brief summary, a realistic total monthlyCost (hosting/license renewals + support staff time, in USD), and
roles (each with hoursPerWeek) for the ongoing support effort needed (e.g. "Support Engineer" at 5 hrs/wk).
If a project has no meaningful ongoing support need (e.g. a one-time physical task), say so in the summary
and use small/zero numbers rather than inventing an unnecessary ongoing cost.

CRITICAL — realism over false precision: every dollar figure and hour estimate must be grounded in
realistic, defensible market rates and typical costs for this kind of work — the kind of numbers an
experienced PM or estimator would actually stand behind, not invented, overly-precise-sounding numbers.
Prefer sensible round numbers over suspiciously exact ones. If you are genuinely uncertain about a cost,
say so explicitly in its "notes" field and give a conservative estimate rather than fabricating confidence.
Do not hallucinate specific vendor names, product versions, or prices you aren't reasonably confident are
typical — describe the category generically instead (e.g. "cloud hosting (AWS/Azure-tier)" rather than
inventing a specific SKU and price).

Output strict JSON matching this shape exactly:
{
  "approach": { "summary": string, "details": { "<label>": "<value>", ... }, "rationale": string },
  "milestones": [{ "name": string, "phase": string, "dueInDays": number }],
  "tasks": [{ "title": string, "description": string, "estimateHours": number, "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "suggestedRole": string, "suggestedHourlyRate": number, "requiredSkills": string[], "requiredExperienceYears": number, "phase": string, "dueInDays": number, "sprintName": string, "storyPoints": number, "executionSource": "AI"|"INTERNAL"|"VENDOR" }],
  "agentFollowUps": [{ "title": string, "description": string, "dueInDays": number }],
  "materialCosts": [{ "name": string, "amount": number, "cadence": "one-time"|"monthly"|"annual", "notes": string }],
  "ongoingSupport": { "summary": string, "monthlyCost": number, "roles": [{ "role": string, "hoursPerWeek": number }] }
}
"phase" values must be exactly one of: ${phases.join(", ")}. Omit "sprintName" and "storyPoints" entirely
(or leave them empty) if the execution methodology is WATERFALL. The "details" object in "approach" should have
2-4 short entries relevant to this project type (e.g. for a technology project: frontend/backend/database/
hosting; for research: methodology/data sources/tools; for physical work: materials/permits/equipment) —
use whatever labels make sense, they don't have to match these examples exactly.

Keep it to 5-8 milestones (spread across all phases) and 10-20 tasks (spread across all phases — every
phase should have real, substantive tasks, not a single token entry). Be realistic and conservative with
estimateHours and rates — these numbers drive the actual schedule and budget the user will approve, and
should be consistent with how much effort the chosen approach genuinely takes. dueInDays is relative to
today, and should increase roughly in phase order (earlier phases due sooner, later phases due latest).`;

  const user_prompt = `Project goal: ${goal}\nTarget completion: ${targetDays ? `${targetDays} days from now` : "not specified, use your judgment"}`;

  const { data: plan, error: planError } = await askClaudeJSON<ProjectPlan>(system, user_prompt);
  if (!plan) {
    return NextResponse.json(
      { error: planError ?? "AI planning failed for an unknown reason." },
      { status: 503 }
    );
  }

  const planTasks = plan.tasks ?? [];
  const schedule = estimateSchedule(planTasks, allResources);
  const teamComposition = buildTeamComposition(planTasks, allResources);
  const phaseBreakdown = buildPhaseBreakdown(planTasks, allResources, phases);
  const laborCost = teamComposition.reduce((sum, r) => sum + r.cost, 0);

  const materialCosts = (plan.materialCosts ?? []).map((m) => ({
    name: m.name,
    amount: m.amount ?? 0,
    cadence: m.cadence ?? "one-time",
    notes: m.notes ?? "",
  }));
  const materialCostTotal = materialCosts.reduce((sum, m) => sum + m.amount, 0);

  const ongoingSupport = {
    summary: plan.ongoingSupport?.summary ?? "",
    monthlyCost: plan.ongoingSupport?.monthlyCost ?? 0,
    roles: plan.ongoingSupport?.roles ?? [],
  };

  const DEFAULT_CONTINGENCY_PERCENT = 10;
  const contingencyPercent =
    typeof body.contingencyPercent === "number" ? body.contingencyPercent : DEFAULT_CONTINGENCY_PERCENT;
  const contingencyAmount = Math.round(((laborCost + materialCostTotal) * contingencyPercent) / 100);
  const totalProjectBudget = laborCost + materialCostTotal + contingencyAmount;

  const fallbackPhase = phases[Math.min(2, phases.length - 1)] ?? phases[0];
  const tasksWithAssignee = planTasks.map((t) => ({
    ...t,
    phase: t.phase && (phases as readonly string[]).includes(t.phase) ? t.phase : fallbackPhase,
    rate: rateForTask(t, allResources),
    resolvedAssigneeName:
      matchResource(allResources, t.suggestedRole, t.requiredSkills, t.requiredExperienceYears)?.name ?? null,
  }));

  return NextResponse.json({
    preview: true,
    projectType,
    phases,
    plan: { ...plan, tasks: tasksWithAssignee },
    approach: plan.approach ?? null,
    totalEffortHours: schedule.totalEffortHours,
    combinedWeeklyCapacity: schedule.combinedWeeklyCapacity,
    suggestedStartDate: schedule.suggestedStartDate.toISOString().slice(0, 10),
    suggestedEndDate: schedule.suggestedEndDate.toISOString().slice(0, 10),
    teamComposition,
    phaseBreakdown,
    laborCost,
    materialCosts,
    materialCostTotal,
    ongoingSupport,
    contingencyPercent,
    contingencyAmount,
    totalProjectBudget,
    // Kept for backward compatibility with anything still reading the old field name.
    totalEstimatedCost: laborCost,
  });
}
