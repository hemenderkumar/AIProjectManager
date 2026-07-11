import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { canAccessOptionalProject } from "@/lib/tenancy";

type RecommendationResult = {
  likelyCategory: string;
  recommendation: string;
  nextSteps: string[];
};

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { incidentId } = await req.json().catch(() => ({}));
  if (!incidentId) return NextResponse.json({ error: "incidentId is required" }, { status: 400 });

  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
  if (!incident) return NextResponse.json({ error: "incident not found" }, { status: 404 });
  if (!(await canAccessOptionalProject(_authUser, incident.projectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let projectName: string | null = null;
  if (incident.projectId) {
    const [project] = await db.select().from(projects).where(eq(projects.id, incident.projectId));
    projectName = project?.name ?? null;
  }

  const system = `You are an experienced support/incident lead giving a quick triage recommendation.
Base your answer ONLY on the incident details given below — do not invent root causes, system names,
error codes, or history that weren't mentioned. If the description doesn't give enough to diagnose,
say so plainly and recommend what information to gather next rather than guessing at a cause.
Respond as JSON: { "likelyCategory": string (a short label like "Access/Permissions", "Data issue",
"Performance", "Integration failure", "Unclear — needs more info", etc. — only pick something specific
if the description actually supports it), "recommendation": string (2-3 sentences, grounded, practical),
"nextSteps": string[] (3-5 concrete, immediately actionable steps) }.`;

  const user = `Incident title: ${incident.title}
Description: ${incident.description || "(no description provided)"}
Severity: ${incident.severity}
Status: ${incident.status}
Linked project: ${projectName ?? "(not linked to a specific project)"}
Existing resolution notes: ${incident.resolutionNotes || "(none yet)"}`;

  const { data, error } = await askClaudeJSON<RecommendationResult>(system, user, 1200);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const recommendationText = `[${data.likelyCategory}] ${data.recommendation}\nNext steps:\n${data.nextSteps.map((s) => `- ${s}`).join("\n")}`;
  await db.update(incidents).set({ aiRecommendation: recommendationText }).where(eq(incidents.id, incidentId));

  return NextResponse.json({ ...data, aiRecommendation: recommendationText });
}
