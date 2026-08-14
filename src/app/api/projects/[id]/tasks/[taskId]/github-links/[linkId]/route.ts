import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskGithubLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; taskId: string; linkId: string }> }) {
  const { id, linkId } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.delete(taskGithubLinks).where(eq(taskGithubLinks.id, linkId));
  return NextResponse.json({ ok: true });
}
