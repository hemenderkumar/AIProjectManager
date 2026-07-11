import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfps, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireOwnedRfp, draftRfpContent } from "@/lib/rfp";
import { logAudit } from "@/lib/audit";

// Draft or re-draft the RFP's document content with AI — grounded in the linked project's
// charter when one exists and is filled in, otherwise in the owner's own pointer fields
// (background/scope/requirements/timeline/budgetRange typed on the RFP itself). Safe to call
// again after the owner edits the pointers; it just overwrites `content`.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { user, rfp } = guard;

  const project = rfp.projectId
    ? (await db.select().from(projects).where(eq(projects.id, rfp.projectId)))[0] ?? null
    : null;

  let content: string;
  try {
    content = await draftRfpContent(rfp, project);
  } catch (err) {
    return NextResponse.json({ error: `AI drafting failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  const [updated] = await db
    .update(rfps)
    .set({ content, createdByAi: true, updatedAt: new Date() })
    .where(eq(rfps.id, id))
    .returning();

  await logAudit({
    actor: user, action: "rfp.drafted", entityType: "rfp", entityId: id,
    organizationId: user.organizationId, detail: `${user.name} generated an AI draft for RFP "${updated.title}".`,
  });

  return NextResponse.json(updated);
}
