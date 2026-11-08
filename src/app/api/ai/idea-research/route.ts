import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";
import { researchMarket } from "@/lib/ideaResearch";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { projectId, focus } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const user = await requireProjectAccess("CONTRIBUTOR", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!p) return NextResponse.json({ error: "project not found" }, { status: 404 });
  if (!p.problemStatement?.trim() && !p.proposedSolution?.trim() && !p.description?.trim()) {
    return NextResponse.json({ error: "Describe the problem or solution first so there's something to research." }, { status: 400 });
  }

  const { data, error } = await researchMarket(
    {
      name: p.name, category: p.ideaCategory, problem: p.problemStatement ?? p.description,
      solution: p.proposedSolution, benefits: p.expectedBenefits, existingAnalysis: p.marketAnalysis,
    },
    typeof focus === "string" && focus.trim() ? focus.trim().slice(0, 300) : null,
  );
  if (!data) return NextResponse.json({ error: error ?? "Research failed" }, { status: 502 });

  const now = new Date();
  await db.update(projects).set({ ideaResearch: data, ideaResearchedAt: now }).where(eq(projects.id, projectId));
  return NextResponse.json({ research: data, researchedAt: now.toISOString() });
}
