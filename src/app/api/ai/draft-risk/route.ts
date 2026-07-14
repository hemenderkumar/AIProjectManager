import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

type RiskDraft = {
  description: string;
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  likelihood: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  mitigation: string;
};

// Turns a rough concern ("vendor keeps missing deadlines on the integration work") into a
// properly framed risk: a clear description, a reasoned impact/likelihood assessment, and a
// concrete mitigation suggestion -- same "rough note -> structured record" pattern as
// incident drafting, scoped to one project's risk register.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!note) {
    return NextResponse.json({ error: "Describe the concern first, then draft with AI." }, { status: 400 });
  }

  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));

  const system = `You are helping a project manager turn a rough, informally-written concern into a properly
framed risk register entry.

Project: ${project?.name ?? "Unknown"}

Rough note from the PM:
"""
${note}
"""

Respond as JSON: { "description": a clear 1-2 sentence risk statement (what could go wrong and why --
not vague, e.g. "The integration vendor has missed two prior deadlines, risking a delayed go-live" not
"Vendor risk"), "impact": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" reasoned from the described consequence if it
occurs, "likelihood": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" reasoned from what's described about how likely this
is, "mitigation": 1-2 sentences on a concrete mitigating action (not a vague "monitor closely") }`;

  const { data, error } = await askClaudeJSON<RiskDraft>(system, "Draft this risk now.", 1200);

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
