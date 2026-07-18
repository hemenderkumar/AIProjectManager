import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

const TEST_TYPES = new Set(["FUNCTIONAL_TEST_SCRIPT", "UAT_SCRIPT"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(deliverables).where(eq(deliverables.projectId, id)).orderBy(desc(deliverables.createdAt));
  const testDeliverableIds = rows.filter((d) => TEST_TYPES.has(d.type)).map((d) => d.id);
  const testCases = testDeliverableIds.length
    ? await db.select().from(deliverableTestCases).where(inArray(deliverableTestCases.deliverableId, testDeliverableIds))
    : [];

  return NextResponse.json(
    rows.map((d) => ({
      ...d,
      testCases: testCases.filter((tc) => tc.deliverableId === d.id).sort((a, b) => a.sequence - b.sequence),
    }))
  );
}

// Manual creation (no AI) — the AI path is POST /api/ai/draft-deliverable, which creates and
// saves in one step. This route exists for the "OTHER" type / hand-written deliverables, or
// re-titling a blank starting point without generating anything.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.title?.trim() || !body.type) {
    return NextResponse.json({ error: "title and type are required" }, { status: 400 });
  }

  const [created] = await db
    .insert(deliverables)
    .values({
      projectId: id,
      type: body.type,
      title: body.title.trim(),
      content: body.content || null,
      createdByAi: false,
      createdBy: user.name,
    })
    .returning();

  await logAudit({
    actor: user, action: "deliverable.created", entityType: "deliverable", entityId: created.id,
    detail: `${user.name} created deliverable "${created.title}" (${created.type}).`,
  });

  return NextResponse.json({ ...created, testCases: [] }, { status: 201 });
}
