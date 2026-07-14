import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { canAccessProject } from "@/lib/tenancy";

type IncidentDraft = {
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

// Turns a rough, unstructured note ("checkout was timing out for a bunch of users around
// 2pm, seemed tied to the payment API") into a properly formed incident record -- a clear
// title, a fuller description, and a reasoned severity -- so filing an incident doesn't
// require someone to already know how to write one well. Same "Draft with AI" pattern as
// the RFP/charter drafting flows, just scoped to a single incident instead of a whole document.
export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json({ error: "Describe what happened first, then draft with AI." }, { status: 400 });
  }

  let projectContext = "(not linked to a specific project)";
  if (body?.projectId) {
    const canAccess = await canAccessProject(user, body.projectId);
    if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, body.projectId));
    if (project) projectContext = `Linked project: ${project.name}`;
  }

  const system = `You are helping a support/delivery team member turn a rough, informally-written note about
something that just went wrong into a properly filed incident record.

${projectContext}

Rough note from the reporter:
"""
${note}
"""

Respond as JSON: { "title": short, specific incident title (not vague, e.g. "Checkout timeouts on payment
API during peak load" not "Site issue"), "description": 2-4 sentences expanding the note into a clear,
factual account of what happened, impact, and any detail already given -- do not invent specifics that
aren't implied by the note, "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" reasoned from the described impact
(CRITICAL only for outages/data loss/security, HIGH for significant user-facing impact, MEDIUM for limited
impact, LOW for minor/cosmetic) }`;

  const { data, error } = await askClaudeJSON<IncidentDraft>(system, "Draft this incident now.", 1200);

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
