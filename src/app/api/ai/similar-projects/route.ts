import { NextRequest, NextResponse } from "next/server";
import { ne } from "drizzle-orm";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess, filterProjectsForUser } from "@/lib/tenancy";
import { summarizeProjectCore } from "@/lib/projectContext";

type SimilarResult = {
  similarProjects: { name: string; whySimilar: string }[];
  commonRequirementThemes: string[];
  commonRisks: string[];
  vendorTechLessons: string[];
  note?: string;
};

// Surfaces recurring requirement/risk/vendor patterns from OTHER projects to help this one
// avoid repeating past mistakes. The comparison pool is filtered through the exact same
// filterProjectsForUser() rule the portfolio list uses, so this can never show a project (or
// its charter/risks) to someone who couldn't already see it elsewhere in Keel — a PM only gets
// patterns from their own assigned projects, a SUPER_USER from their whole company, an ADMIN
// from everything.
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const user = await requireProjectAccess("VIEWER", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const others = await db
    .select({
      id: projects.id,
      name: projects.name,
      organizationId: projects.organizationId,
      description: projects.description,
      problemStatement: projects.problemStatement,
      proposedSolution: projects.proposedSolution,
      scopeInScope: projects.scopeInScope,
      risks: projects.risks,
      recommendedTechnology: projects.recommendedTechnology,
    })
    .from(projects)
    .where(ne(projects.id, projectId));

  const visible = await filterProjectsForUser(others, user);
  if (visible.length === 0) {
    return NextResponse.json<SimilarResult>({
      similarProjects: [],
      commonRequirementThemes: [],
      commonRisks: [],
      vendorTechLessons: [],
      note: "No other projects you have access to yet — patterns will show up here once there's more portfolio history to compare against.",
    });
  }

  const candidateList = visible
    .slice(0, 30)
    .map(
      (p) =>
        `- "${p.name}": ${p.description || p.problemStatement || "(no description)"}. Proposed solution: ${
          p.proposedSolution || "n/a"
        }. Scope: ${p.scopeInScope || "n/a"}. Tech: ${p.recommendedTechnology || "n/a"}. Risks: ${p.risks || "n/a"}.`
    )
    .join("\n");

  const system = `You find patterns across a portfolio of projects to help a new project avoid repeating past
mistakes. Given the CURRENT project below and a list of OTHER projects this user has visibility into, pick
the 2-3 most genuinely similar other projects (by domain, technology, or approach — not superficial wording
overlap) and extract recurring patterns: common requirement themes, common risks, and any vendor/technology
lessons implied by the other projects' notes. If nothing is genuinely similar, say so honestly in "note"
rather than forcing a weak comparison.

Current project:
${summarizeProjectCore(detail)}

Other projects:
${candidateList}

Respond as JSON: { "similarProjects": [{ "name": string, "whySimilar": string (1 sentence) }] (0-3 items),
"commonRequirementThemes": string[], "commonRisks": string[], "vendorTechLessons": string[], "note": string
(only if no genuinely similar projects were found — omit otherwise) }`;

  const { data, error } = await askClaudeJSON<SimilarResult>(system, "Find similar projects and patterns now.", 2500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  return NextResponse.json(data);
}
