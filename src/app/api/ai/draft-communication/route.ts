import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

type CommunicationDraft = {
  type: "MEETING" | "EMAIL" | "SLACK" | "CALL" | "WORKSHOP" | "OTHER";
  summary: string;
  participants: string;
  actionItems: string;
};

// Turns raw, unstructured meeting/call notes into a properly logged communication entry --
// a clean summary, the participants mentioned, and a distinct action-items list -- instead of
// requiring someone to reorganize their own scribbled notes by hand. Same "rough note ->
// structured record" pattern as incidents/risks/tasks, scoped to one project's comms log.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const note = typeof body?.note === "string" ? body.note.trim() : "";

  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!note) {
    return NextResponse.json({ error: "Paste or type the raw notes first, then draft with AI." }, { status: 400 });
  }

  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId));

  const system = `You are helping a project manager turn raw, unstructured notes from a meeting, call, or
message thread into a properly logged communication record.

Project: ${project?.name ?? "Unknown"}

Raw notes from the PM:
"""
${note}
"""

Respond as JSON: { "type": "MEETING"|"EMAIL"|"SLACK"|"CALL"|"WORKSHOP"|"OTHER" guessed from context clues in
the note (default "MEETING" if unclear), "summary": 2-3 sentences capturing what was discussed and decided
-- do not invent details not implied by the note, "participants": a comma-separated list of names/roles
mentioned in the note (empty string if none are mentioned), "actionItems": a short list of concrete
follow-up items as plain text (one per line, empty string if none are implied) }`;

  const { data, error } = await askClaudeJSON<CommunicationDraft>(system, "Draft this communication log entry now.", 1200);

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
