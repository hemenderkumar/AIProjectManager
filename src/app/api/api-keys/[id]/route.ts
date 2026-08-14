import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { revokeApiKey } from "@/lib/apiKeys";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await revokeApiKey(id);
  return NextResponse.json({ ok: true });
}
