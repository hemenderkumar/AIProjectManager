import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { randomBytes } from "crypto";

// Generates (or rotates) this project's calendar-feed token. Mirrors the opaque-random-token
// pattern used by statusRequests/passwordResetTokens elsewhere in this app -- looked up
// server-side, not a signed JWT, so it can be revoked just by clearing the column.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = randomBytes(24).toString("hex");
  const [updated] = await db
    .update(projects)
    .set({ icsToken: token })
    .where(eq(projects.id, id))
    .returning({ icsToken: projects.icsToken });

  return NextResponse.json({ icsToken: updated.icsToken });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.update(projects).set({ icsToken: null }).where(eq(projects.id, id));
  return NextResponse.json({ ok: true });
}
