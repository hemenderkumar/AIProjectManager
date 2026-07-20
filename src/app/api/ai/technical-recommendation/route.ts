import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

type TechnicalRecommendation = {
  recommendedTechnology: string;
  rationale: string;
  architectureDiagram: string;
  highLevelArchitecture: string;
  architectureProsCons: string;
};

export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const _authUser = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
Do not include markdown code fences, just the raw Mermaid syntax starting with "flowchart TD". The diagram
must depict the SAME components described in highLevelArchitecture below — don't introduce new ones only
in one place.

Also write the two things an architect needs to review and approve this design: a description of the
major components/layers and how they fit together (highLevelArchitecture), and why this is the technically
sound option — trade-offs, what it optimizes for, what it gives up (architectureProsCons).

Respond as JSON: { "recommendedTechnology": string (short label, e.g. "React + Node.js + PostgreSQL on
AWS ECS"), "rationale": string (3-5 sentences: why this fits, referencing the options/feasibility given),
"architectureDiagram": string (raw Mermaid flowchart TD syntax, no code fences), "highLevelArchitecture":
string (2-4 sentences describing the major components/layers and how they fit together), "architectureProsCons":
string (3-6 bullet points, one per line starting with "- ", on trade-offs and what this choice optimizes for
vs. gives up) }`;

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
      highLevelArchitecture: data.highLevelArchitecture,
      architectureProsCons: data.architectureProsCons,
      // A fresh recommendation needs fresh sign-off — clear any prior review/approval on both
      // the feasibility (technical direction) and architecture (specific design) gates, since
      // this regenerates what both of those were reviewing. Harmless no-op if neither was set
      // yet (e.g. the very first recommendation, called from the Feasibility tab).
      technicalReviewStatus: "PENDING",
      technicalReviewedBy: null,
      technicalReviewedAt: null,
      technicalReviewNotes: null,
      architectureApprovedBy: null,
      architectureApprovedAt: null,
      architectureReviewNotes: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  return NextResponse.json({ project: updated });
}
