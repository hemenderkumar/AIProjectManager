import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/tenancy";
import { deleteWorkflowStage } from "@/lib/customFields";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  const { id, stageId } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deleteWorkflowStage(stageId);
  return NextResponse.json({ ok: true });
}
