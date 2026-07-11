import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfps, rfpCriteria, rfpVendors, rfpVendorScores, rfpRecommendations, projects } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireOwnedRfp } from "@/lib/rfp";
import { logAudit } from "@/lib/audit";

// Full detail payload for the RFP workspace UI: the RFP itself, its scoring rubric, every
// invited vendor with their own per-criterion scores nested in, and the current overall
// recommendation (if evaluation has run). Never includes vendor tokens in bulk anywhere else
// but here — this route is only reachable by the owning SUPER_USER or an ADMIN
// (requireOwnedRfp), so that's safe.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { rfp } = guard;

  const [project, criteria, vendors, recommendation] = await Promise.all([
    rfp.projectId ? db.select().from(projects).where(eq(projects.id, rfp.projectId)).then((r) => r[0] ?? null) : Promise.resolve(null),
    db.select().from(rfpCriteria).where(eq(rfpCriteria.rfpId, id)),
    db.select().from(rfpVendors).where(eq(rfpVendors.rfpId, id)),
    db.select().from(rfpRecommendations).where(eq(rfpRecommendations.rfpId, id)).then((r) => r[0] ?? null),
  ]);

  const vendorIds = vendors.map((v) => v.id);
  const scores = vendorIds.length > 0
    ? await db.select().from(rfpVendorScores).where(inArray(rfpVendorScores.rfpVendorId, vendorIds))
    : [];

  const vendorsWithScores = vendors.map((v) => ({
    ...v,
    scores: scores.filter((s) => s.rfpVendorId === v.id),
  }));

  return NextResponse.json({
    rfp,
    project: project ? { id: project.id, name: project.name, hasCharter: Boolean(project.businessCase?.trim() || project.objectives?.trim()) } : null,
    criteria,
    vendors: vendorsWithScores,
    recommendation,
  });
}

const EDITABLE = ["title", "background", "scope", "requirements", "timeline", "budgetRange", "content", "status"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { user, rfp } = guard;

  const body = await req.json();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of EDITABLE) {
    if (key in body) update[key] = body[key] || null;
  }
  if (update.status === "PUBLISHED" && rfp.status !== "PUBLISHED") update.publishedAt = new Date();

  const [updated] = await db.update(rfps).set(update).where(eq(rfps.id, id)).returning();

  if (update.status === "PUBLISHED" && rfp.status !== "PUBLISHED") {
    await logAudit({
      actor: user, action: "rfp.published", entityType: "rfp", entityId: id,
      organizationId: rfp.organizationId, detail: `${user.name} published RFP "${updated.title}".`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { user, rfp } = guard;

  await db.delete(rfps).where(eq(rfps.id, id));
  await logAudit({
    actor: user, action: "rfp.deleted", entityType: "rfp", entityId: id,
    organizationId: rfp.organizationId, detail: `${user.name} deleted RFP "${rfp.title}".`,
  });
  return NextResponse.json({ ok: true });
}
