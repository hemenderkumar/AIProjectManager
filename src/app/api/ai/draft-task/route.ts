import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

type TaskDraft = {
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimateHours: number;
  dueInDays: number;
};

// Turns a one-line ask ("need to set up the staging environment before the demo next week")
// into a properly formed task: a clear title, a reasoned priority, a rough effort estimate,
// and a suggested due date -- same "rough note -> structured record" pattern used for
// incidents and risks, scoped to one project's task list.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!note) {
    return NextResponse.json({ error: "Describe the task first, then draft with AI." }, { status: 400 });
  }

  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));

  const system = `You are helping a project manager turn a one-line ask into a properly formed task entry.

Project: ${project?.name ?? "Unknown"}

Rough note from the PM:
"""
${note}
"""

Respond as JSON: { "title": a clear, specific task title (not vague, e.g. "Provision and configure the
staging environment" not "Staging work"), "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" reasoned from any
urgency implied in the note (default MEDIUM if nothing suggests otherwise), "estimateHours": a reasonable
rough effort estimate in hours for this single task (a plain number, e.g. 4), "dueInDays": a reasonable
number of days from today this should be done by, reasoned from any deadline mentioned or implied (default
7 if nothing is mentioned) }`;

  const { data, error } = await askClaudeJSON<TaskDraft>(system, "Draft this task now.", 800);

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
