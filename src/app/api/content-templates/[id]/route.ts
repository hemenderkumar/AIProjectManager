import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { deleteContentTemplate } from "@/lib/contentTemplates";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const ok = await deleteContentTemplate(user, id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
