import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, projectMembers } from "@/lib/db/schema";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const _authUser = await requireRole("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await getAllProjectsWithMetrics(_authUser);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(projects)
    .values({
      name: body.name,
      // A client-company user (SUPER_USER, or any project-scoped role) can only ever create
      // a project for their own organization — never unassigned or another company's.
      organizationId: _authUser.organizationId ?? null,
      description: body.description ?? null,
      sponsor: body.sponsor ?? null,
      projectManager: body.projectManager ?? null,
      stage: body.stage ?? "INCEPTION",
      priority: body.priority ?? "MEDIUM",
      country: body.country ?? null,
      program: body.program ?? null,
      problemStatement: body.problemStatement ?? null,
      proposedSolution: body.proposedSolution ?? null,
      expectedBenefits: body.expectedBenefits ?? null,
      ideationNotes: body.ideationNotes ?? null,
      ideaType: body.ideaType === "OPPORTUNITY" || body.ideaType === "PROBLEM" ? body.ideaType : null,
    })
    .returning();

  // PM/CONTRIBUTOR/VIEWER visibility is membership-based (project scope) — without this,
  // the person who just created the project couldn't see their own creation. ADMIN/SUPER_USER
  // don't need it (scope already covers them), but adding it is harmless either way.
  await db.insert(projectMembers).values({ projectId: created.id, userId: _authUser.id });

  return NextResponse.json(created, { status: 201 });
}
