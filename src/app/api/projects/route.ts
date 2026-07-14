import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, projectMembers, stakeholders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
  // If a structured sponsor (stakeholder) was picked, denormalize their name into the plain
  // `sponsor` text column too — same reasoning as the PATCH route: every existing consumer
  // reads `sponsor` as text.
  let sponsorName: string | null = body.sponsor ?? null;
  if (body.sponsorStakeholderId) {
    const [stakeholder] = await db.select({ name: stakeholders.name }).from(stakeholders).where(eq(stakeholders.id, body.sponsorStakeholderId));
    if (stakeholder) sponsorName = stakeholder.name;
  }

  const [created] = await db
    .insert(projects)
    .values({
      name: body.name,
      // A client-company user (SUPER_USER, or any project-scoped role) can only ever create
      // a project for their own organization — never unassigned or another company's.
      organizationId: _authUser.organizationId ?? null,
      description: body.description ?? null,
      sponsor: sponsorName,
      sponsorStakeholderId: body.sponsorStakeholderId || null,
      projectManager: body.projectManager ?? null,
      stage: body.stage ?? "INCEPTION",
      priority: body.priority ?? "MEDIUM",
      country: body.country ?? null,
      stateProvince: body.stateProvince ?? null,
      program: body.program ?? null,
      problemStatement: body.problemStatement ?? null,
      proposedSolution: body.proposedSolution ?? null,
      expectedBenefits: body.expectedBenefits ?? null,
      ideationNotes: body.ideationNotes ?? null,
      // Neither project-creation form (independent "New Project" or the Ideation-intent one)
      // actually has an Idea Type field to fill in, so this was always landing on null --
      // which the Inception & Ideation tab then flags with a red-outlined <select> stuck on
      // its disabled placeholder option plus an amber "Set an idea type" warning, on every
      // single new project, whether or not it came from the Ideation flow. Defaulting to
      // "OPPORTUNITY" (the more common case, and freely editable afterward) means a freshly
      // created project doesn't look broken/unfinished the moment you open it.
      ideaType: body.ideaType === "OPPORTUNITY" || body.ideaType === "PROBLEM" ? body.ideaType : "OPPORTUNITY",
    })
    .returning();

  // PM/CONTRIBUTOR/VIEWER visibility is membership-based (project scope) — without this,
  // the person who just created the project couldn't see their own creation. ADMIN/SUPER_USER
  // don't need it (scope already covers them), but adding it is harmless either way.
  await db.insert(projectMembers).values({ projectId: created.id, userId: _authUser.id });

  return NextResponse.json(created, { status: 201 });
}
