import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

type TechnicalRecommendation = {
  recommendedTechnology: string;
  rationale: string;
  architectureDiagram: string;
};

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  if (!p.problemStatement?.trim() && !p.proposedSolution?.trim()) {
    return NextResponse.json(
      { error: "Add a problem statement or proposed solution first — the technical recommendation is grounded in what's being solved." },
      { status: 400 }
    );
  }

  const optionsSummary = detail.solutionOptions.length
    ? detail.solutionOptions
        .map((o) => `- ${o.name}${o.isSelected ? " (selected direction)" : ""}: ${o.description ?? ""}${o.feasibilityNotes ? ` [feasibility: ${o.feasibilityNotes}]` : ""}`)
        .join("\n")
    : "(no solution options logged — recommend directly from the problem/solution below)";

  const system = `You are an enterprise architect asked for a technical recommendation BEFORE a project
charter is drafted. Given the problem/opportunity, any compared solution options, and feasibility notes,
recommend ONE concrete, specific technical direction — an actual technology/architecture choice, not a
vague category. Ground it only in the information given; do not invent unrelated requirements.

Then produce a simple Mermaid diagram (flowchart TD syntax) showing the major components/layers and how
they connect — e.g. client, API/backend, database, external integrations, based on the recommended
technology. Keep it to 5-10 nodes with short labels and simple arrows (A --> B). Use only valid Mermaid
"flowchart TD" syntax with alphanumeric node ids and labels in square brackets, e.g.:
flowchart TD
  A[Web Client] --> B[API Server]
  B --> C[(Database)]
Do not include markdown code fences, just the raw Mermaid syntax starting with "flowchart TD".

Respond as JSON: { "recommendedTechnology": string (short label, e.g. "React + Node.js + PostgreSQL on
AWS ECS"), "rationale": string (3-5 sentences: why this fits, referencing the options/feasibility given),
"architectureDiagram": string (raw Mermaid flowchart TD syntax, no code fences) }`;

  const user = `Project: ${p.name}
Problem statement: ${p.problemStatement || "(none)"}
Proposed solution: ${p.proposedSolution || "(none)"}
Expected benefits: ${p.expectedBenefits || "(none)"}
Feasibility score (0-100): ${p.feasibilityScore ?? "(not assessed)"}
Feasibility notes: ${p.feasibilityNotes || "(none)"}
Solution options considered:
${optionsSummary}`;

  const { data, error } = await askClaudeJSON<TechnicalRecommendation>(system, user, 2000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const [updated] = await db
    .update(projects)
    .set({
      recommendedTechnology: data.recommendedTechnology,
      technicalRecommendationRationale: data.rationale,
      architectureDiagram: data.architectureDiagram,
      // A fresh recommendation needs fresh sign-off — clear any prior review.
      technicalReviewStatus: "PENDING",
      technicalReviewedBy: null,
      technicalReviewedAt: null,
      technicalReviewNotes: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  return NextResponse.json({ project: updated });
}
