import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { roadmapItems, roadmaps, projects, rfps } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { draftRfpContent, projectHasCharter } from "@/lib/rfp";
import { logAudit } from "@/lib/audit";

// The "Draft RFP" shortcut on a roadmap item: takes a prioritized idea straight into a
// ready-to-send RFP without the owner re-typing anything Charter already captured, closing the
// gap between "we decided to do this" (Roadmap) and "let's find someone to build it" (RFP).
// Same role floor as POST /api/rfps (SUPER_USER, roleAtLeast also passes ADMIN) since this
// creates a real rfps row the same way that route does.
export async function POST(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { itemId } = await params;

  const [row] = await db
    .select({
      itemId: roadmapItems.id,
      roadmapId: roadmapItems.roadmapId,
      roadmapOrgId: roadmaps.organizationId,
      project: projects,
    })
    .from(roadmapItems)
    .innerJoin(roadmaps, eq(roadmapItems.roadmapId, roadmaps.id))
    .innerJoin(projects, eq(roadmapItems.projectId, projects.id))
    .where(eq(roadmapItems.id, itemId));

  if (!row) return NextResponse.json({ error: "Roadmap item not found." }, { status: 404 });

  // Same tenancy rule as requireOwnedRfp: ADMIN can act for any company, SUPER_USER only its
  // own. A roadmap's organizationId is the source of truth here (not the project's, though in
  // practice they match) since that's what the created RFP will be filed under.
  if (user.role !== "ADMIN" && row.roadmapOrgId !== user.organizationId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!row.roadmapOrgId) {
    return NextResponse.json({ error: "This roadmap isn't linked to a company, so an RFP can't be filed under one." }, { status: 400 });
  }

  const project = row.project;

  const [created] = await db
    .insert(rfps)
    .values({
      organizationId: row.roadmapOrgId,
      projectId: project.id,
      title: `RFP: ${project.name}`,
      background: projectHasCharter(project) ? null : project.description || null,
      createdBy: user.name,
    })
    .returning();

  const content = await draftRfpContent(created, project);
  await db.update(rfps).set({ content, createdByAi: true, updatedAt: new Date() }).where(eq(rfps.id, created.id));

  await logAudit({
    actor: user,
    action: "rfp.created",
    entityType: "rfp",
    entityId: created.id,
    organizationId: row.roadmapOrgId,
    detail: `${user.name} drafted RFP "${created.title}" directly from roadmap item for project "${project.name}".`,
  });

  return NextResponse.json({ rfpId: created.id });
}
