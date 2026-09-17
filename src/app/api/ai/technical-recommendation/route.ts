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

  // A physical/build idea doesn't have a "system architecture" in the software sense — the
  // useful equivalent is a process-flow diagram (how it actually gets made, step by step),
  // and "architecture" here means the production/build approach, not a tech stack.
  const isBuildCategory = p.ideaCategory === "HARDWARE_PHYSICAL" || p.ideaCategory === "SERVICE" || p.ideaCategory === "OTHER";

  const system = isBuildCategory
    ? `You are advising on the build/production approach for a physical or non-software idea (category:
${p.ideaCategory}) BEFORE a project charter is drafted. Given the problem/opportunity and any build
requirements already captured (materials, infrastructure, sourcing), recommend ONE concrete build/production
approach — not a vague category. Ground it only in the information given; do not invent unrelated
requirements, specific vendors, or costs.

Then produce a simple Mermaid diagram (flowchart TD syntax) showing the PROCESS FLOW — the sequence of
steps from input to finished output (e.g. source materials -> fabricate/assemble -> quality check -> package
-> ship), not a software system diagram. Keep it to 5-10 nodes with short labels and simple arrows (A --> B).
Use only valid Mermaid "flowchart TD" syntax with alphanumeric node ids and labels in square brackets, e.g.:
flowchart TD
  A[Source materials] --> B[Fabricate]
  B --> C[Quality check]
Do not include markdown code fences, just the raw Mermaid syntax starting with "flowchart TD". The diagram
must depict the SAME steps described in highLevelArchitecture below — don't introduce new ones only in one
place.

Also write the two things a reviewer needs to sign off on this approach: a description of the major
production steps and how they fit together (highLevelArchitecture), and why this is the sound approach —
trade-offs, what it optimizes for, what it gives up (architectureProsCons).

Respond as JSON: { "recommendedTechnology": string (short label for the build approach, e.g. "In-house FDM
print farm, TPU uppers + bonded soles"), "rationale": string (3-5 sentences: why this fits, referencing the
build requirements/feasibility given), "architectureDiagram": string (raw Mermaid flowchart TD syntax, no
code fences, depicting the PROCESS FLOW), "highLevelArchitecture": string (2-4 sentences describing the
major production steps and how they fit together), "architectureProsCons": string (3-6 bullet points, one
per line starting with "- ", on trade-offs and what this approach optimizes for vs. gives up) }`
    : `You are an enterprise architect asked for a technical recommendation BEFORE a project
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

  const user = isBuildCategory
    ? `Project: ${p.name}
Idea category: ${p.ideaCategory}
Has a software component: ${p.hasSoftwareComponent ? "yes" : "no"}
Problem statement: ${p.problemStatement || "(none)"}
Proposed solution: ${p.proposedSolution || "(none)"}
Expected benefits: ${p.expectedBenefits || "(none)"}
Feasibility score (0-100): ${p.feasibilityScore ?? "(not assessed)"}
Feasibility notes: ${p.feasibilityNotes || "(none)"}
Materials/components: ${p.buildMaterialsList || "(not yet captured)"}
Infrastructure needs: ${p.buildInfrastructureNeeds || "(not yet captured)"}
Sourcing categories: ${p.buildSourcingNotes || "(not yet captured)"}`
    : `Project: ${p.name}
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
