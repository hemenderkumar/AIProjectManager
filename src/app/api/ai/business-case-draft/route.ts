import { NextRequest, NextResponse } from "next/server";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { draftBusinessCase } from "@/lib/businessCaseDraft";

// Business Case sub-tab (Plan sequence, between Architecture and Charter): the idea-evaluation
// deliverable -- "should we do this and why" -- as opposed to Charter's "here's the authorized
// scope/cost/plan to execute it." A first pass is auto-drafted at project creation (see
// api/projects POST) once there's a problem/solution to ground it in; this route is the manual
// "Generate"/"Regenerate" button in the tab itself, once more context (feasibility, pricing) has
// been captured. Shared drafting logic lives in lib/businessCaseDraft.ts.
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
      { error: "Add a problem statement or proposed solution (Idea & Alignment) first — there's not enough to build a business case from yet." },
      { status: 400 }
    );
  }

  const { data, error } = await draftBusinessCase(p);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const update = {
    ...data,
    // A fresh draft supersedes any prior sign-off — same pattern as architecture regeneration
    // clearing architectureApprovedAt in ArchitectureWorkspace's generateWithAi.
    businessCaseApprovedBy: null,
    businessCaseApprovedAt: null,
    updatedAt: new Date(),
  };

  const [updated] = await db.update(projects).set(update).where(eq(projects.id, projectId)).returning();

  return NextResponse.json({ project: updated });
}
