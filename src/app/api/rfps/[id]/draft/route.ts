import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfps, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireOwnedRfp, draftRfpContent } from "@/lib/rfp";
import { getStylePresetAddendum } from "@/lib/contentTemplates";
import { logAudit } from "@/lib/audit";

// Draft or re-draft the RFP's document content with AI — grounded in the linked project's
// charter when one exists and is filled in, otherwise in the owner's own pointer fields
// (background/scope/requirements/timeline/budgetRange typed on the RFP itself). Safe to call
// again after the owner edits the pointers; it just overwrites `content`. An optional
// templateId in the body points at a saved STYLE_PRESET (see lib/contentTemplates.ts) whose
// instruction is appended to the drafting prompt.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { user, rfp } = guard;

  const { templateId } = await req.json().catch(() => ({ templateId: undefined }));

  const project = rfp.projectId
    ? (await db.select().from(projects).where(eq(projects.id, rfp.projectId)))[0] ?? null
    : null;

  let content: string;
  try {
    const styleAddendum = await getStylePresetAddendum(user, templateId);
    content = await draftRfpContent(rfp, project, styleAddendum);
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
    organizationId: rfp.organizationId, detail: `${user.name} generated an AI draft for RFP "${updated.title}".`,
  });

  return NextResponse.json(updated);
}
