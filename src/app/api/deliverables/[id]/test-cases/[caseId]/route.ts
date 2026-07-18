import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// Executing a test case and recording the result — the entire point of generating these as
// structured rows instead of a plain document. Anyone with CONTRIBUTOR+ project access can
// run a test and log it, same tier as updating a task's status.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; caseId: string }> }
) {
  const { id, caseId } = await params;
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("CONTRIBUTOR", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.scenario !== undefined) update.scenario = body.scenario;
  if (body.steps !== undefined) update.steps = body.steps;
  if (body.expectedResult !== undefined) update.expectedResult = body.expectedResult;
  if (body.actualResult !== undefined) update.actualResult = body.actualResult;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.status !== undefined) {
    update.status = body.status;
    if (body.status !== "NOT_RUN") {
      update.executedBy = user.name;
      update.executedAt = new Date();
    }
  }

  const [updated] = await db
    .update(deliverableTestCases)
    .set(update)
    .where(eq(deliverableTestCases.id, caseId))
    .returning();
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; caseId: string }> }
) {
  const { id, caseId } = await params;
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("CONTRIBUTOR", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.delete(deliverableTestCases).where(eq(deliverableTestCases.id, caseId));
  return NextResponse.json({ ok: true });
}
