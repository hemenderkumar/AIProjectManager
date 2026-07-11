import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfps, projects } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Vendor Evaluation is an org-owner (SUPER_USER) tool, scoped strictly to their own
// organization — same convention as /api/organization/divisions and /stakeholders. Vendor
// proposals are commercially sensitive, so unlike the stakeholder directory this isn't even
// opened up to VIEWER-tier reads within the org.
export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(rfps)
    .where(eq(rfps.organizationId, user.organizationId))
    .orderBy(desc(rfps.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // Standalone by design — projectId is optional, and if given it must belong to the same
  // organization (never let an RFP silently attach to another company's project).
  let projectId: string | null = null;
  if (body.projectId) {
    const [project] = await db.select({ id: projects.id, organizationId: projects.organizationId }).from(projects).where(eq(projects.id, body.projectId));
    if (project && project.organizationId === user.organizationId) projectId = project.id;
  }

  const [created] = await db
    .insert(rfps)
    .values({
      organizationId: user.organizationId,
      projectId,
      title: body.title.trim(),
      background: body.background || null,
      scope: body.scope || null,
      requirements: body.requirements || null,
      timeline: body.timeline || null,
      budgetRange: body.budgetRange || null,
      createdBy: user.name,
    })
    .returning();

  await logAudit({
    actor: user, action: "rfp.created", entityType: "rfp", entityId: created.id,
    organizationId: user.organizationId, detail: `${user.name} created RFP "${created.title}".`,
  });

  return NextResponse.json(created, { status: 201 });
}
