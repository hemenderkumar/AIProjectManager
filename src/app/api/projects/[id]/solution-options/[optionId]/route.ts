import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { solutionOptions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

const allowed = ["name", "description", "pros", "cons", "feasibilityNotes", "isSelected"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  const { id, optionId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in body)) continue;
    update[key] = body[key] === "" ? null : body[key];
  }

  // Only one solution option can be "selected" at a time per project.
  if (update.isSelected === true) {
    await db
      .update(solutionOptions)
      .set({ isSelected: false })
      .where(and(eq(solutionOptions.projectId, id), eq(solutionOptions.isSelected, true)));
  }

  const [updated] = await db.update(solutionOptions).set(update).where(eq(solutionOptions.id, optionId)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  const { id, optionId } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(solutionOptions).where(eq(solutionOptions.id, optionId));
  return NextResponse.json({ ok: true });
}
