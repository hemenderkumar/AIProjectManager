import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/tenancy";
import { getProjectDetail } from "@/lib/portfolio";
import { computeIdeaCost } from "@/lib/ideaEvaluation";
import { draftAsk } from "@/lib/ideaResearch";

export const maxDuration = 60;

// Drafts the five "Ask" fields. Returns them without saving so the user can edit first.
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;
  const cost = computeIdeaCost({ items: detail.costItems, ...p });
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  const costLine = `one-time ${fmt(cost.oneTimeTotal)}, ongoing ${fmt(cost.ongoingAnnual)}/yr${p.totalFundingRequired ? `, funding requested ${fmt(p.totalFundingRequired)}` : ""}`;

  const { data, error } = await draftAsk(
    { name: p.name, category: p.ideaCategory, problem: p.problemStatement ?? p.description, solution: p.proposedSolution, benefits: p.expectedBenefits },
    costLine,
  );
  if (!data) return NextResponse.json({ error: error ?? "Could not draft the ask" }, { status: 502 });
  return NextResponse.json({ ask: data });
}
