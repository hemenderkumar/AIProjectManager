import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, milestones, resources } from "@/lib/db/schema";
import { askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";

interface PlanTask {
  title: string;
  description?: string;
  estimateHours?: number;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  suggestedRole?: string;
  dueInDays?: number;
}

interface PlanMilestone {
  name: string;
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

export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId, goal, targetDays } = await req.json();
  if (!projectId || !goal) {
    return NextResponse.json({ error: "projectId and goal are required" }, { status: 400 });
  }

  const allResources = await db.select().from(resources);
  const resourceList = allResources
    .filter((r) => r.role !== "AI Project Manager")
    .map((r) => `${r.name} (${r.role ?? "no role set"}, ${r.capacityHoursPerWk ?? 40} hrs/wk capacity)`)
    .join("\n");

  const system = `You are an experienced AI project manager agent. Given a project goal, produce a
realistic work breakdown structure: milestones, tasks with effort estimates and priority, and a
suggested role for who should do each task (pick from the team roster below, or a generic role like
"Engineer" or "Designer" if nothing fits). Also list 2-4 follow-up actions YOU (the AI PM) will own —
things like "check in with X on Y" or "prepare steering committee update" — not delivery work.

Team roster:
${resourceList || "No team members yet — suggest generic roles."}

Output strict JSON matching this shape exactly:
{
  "milestones": [{ "name": string, "dueInDays": number }],
  "tasks": [{ "title": string, "description": string, "estimateHours": number, "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "suggestedRole": string, "dueInDays": number }],
  "agentFollowUps": [{ "title": string, "description": string, "dueInDays": number }]
}
Keep it to 3-6 milestones and 6-14 tasks. dueInDays is relative to today.`;

  const user_prompt = `Project goal: ${goal}\nTarget completion: ${targetDays ? `${targetDays} days from now` : "not specified, use your judgment"}`;

  const plan = await askClaudeJSON<ProjectPlan>(system, user_prompt);
  if (!plan) {
    return NextResponse.json(
      { error: "AI planning is not available. Add ANTHROPIC_API_KEY to enable it, or the model returned an unparseable response." },
      { status: 503 }
    );
  }

  const today = new Date();
  const addDays = (n: number) => new Date(today.getTime() + (n ?? 7) * 86400000);

  function matchResource(suggestedRole?: string) {
    if (!suggestedRole) return null;
    const needle = suggestedRole.toLowerCase();
    const match = allResources.find(
      (r) =>
        r.role !== "AI Project Manager" &&
        (r.role?.toLowerCase().includes(needle) || needle.includes((r.role ?? "").toLowerCase()))
    );
    return match?.id ?? null;
  }

  const createdMilestones = plan.milestones?.length
    ? await db
        .insert(milestones)
        .values(
          plan.milestones.map((m) => ({
            projectId,
            name: m.name,
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
            title: t.title,
            description: t.description ?? null,
            priority: t.priority ?? "MEDIUM",
            estimateHours: t.estimateHours ?? 8,
            assigneeId: matchResource(t.suggestedRole),
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

  return NextResponse.json({
    milestones: createdMilestones,
    tasks: createdTasks,
    agentFollowUps: createdFollowUps,
  });
}
