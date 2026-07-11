import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfps, projects, organizations } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Vendor Evaluation is usable two ways: a client's SUPER_USER manages their own company's
// RFPs (scoped strictly to their own organizationId, same convention as
// /api/organization/divisions and /stakeholders), OR a Keel ADMIN manages RFPs on behalf of
// ANY company from the Admin side — since ADMIN has no organization of its own, it must say
// which company it's acting for via an explicit organizationId (query param on GET, body
// field on POST) rather than having one inferred from the session.
export async function GET(req: NextRequest) {
  const user = await requireRole("SUPER_USER"); // roleAtLeast also passes ADMIN through
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let organizationId: string | null;
  if (user.role === "ADMIN") {
    organizationId = req.nextUrl.searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json([]); // no company selected yet — nothing to show
  } else {
    if (!user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    organizationId = user.organizationId;
  }

  const rows = await db
    .select()
    .from(rfps)
    .where(eq(rfps.organizationId, organizationId))
    .orderBy(desc(rfps.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER"); // roleAtLeast also passes ADMIN through
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });

  let organizationId: string;
  if (user.role === "ADMIN") {
    if (!body.organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, body.organizationId));
    if (!org) return NextResponse.json({ error: "That company does not exist." }, { status: 400 });
    organizationId = org.id;
  } else {
    if (!user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    organizationId = user.organizationId;
  }

  // Standalone by design — projectId is optional, and if given it must belong to the same
  // organization (never let an RFP silently attach to another company's project).
  let projectId: string | null = null;
  if (body.projectId) {
    const [project] = await db.select({ id: projects.id, organizationId: projects.organizationId }).from(projects).where(eq(projects.id, body.projectId));
    if (project && project.organizationId === organizationId) projectId = project.id;
  }

  const [created] = await db
    .insert(rfps)
    .values({
      organizationId,
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
    organizationId, detail: `${user.name} created RFP "${created.title}".`,
  });

  return NextResponse.json(created, { status: 201 });
}
