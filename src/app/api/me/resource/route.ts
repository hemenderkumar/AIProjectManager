import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resources, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// Self-service — any logged-in user can see/edit only the one Resources row they're linked
// to (set by an admin via Users & roles), and only their own rate. This is deliberately not
// gated by requireInternal: it's how a self-registered "individual" account (who has no
// access to the internal Resources roster or company-wide Rate Cards at all) can still see
// and manage their own rate, without opening up anyone else's.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [me] = await db.select({ resourceId: users.resourceId }).from(users).where(eq(users.id, user.id));
  if (!me?.resourceId) return NextResponse.json(null);

  const [resource] = await db.select().from(resources).where(eq(resources.id, me.resourceId));
  return NextResponse.json(resource ?? null);
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [me] = await db.select({ resourceId: users.resourceId }).from(users).where(eq(users.id, user.id));
  if (!me?.resourceId) return NextResponse.json({ error: "No resource profile is linked to your account." }, { status: 404 });

  const body = await req.json();
  if (body.costPerHour === undefined) return NextResponse.json({ error: "costPerHour is required" }, { status: 400 });
  const costPerHour = body.costPerHour === "" || Number.isNaN(Number(body.costPerHour)) ? 0 : Number(body.costPerHour);

  const [updated] = await db.update(resources).set({ costPerHour }).where(eq(resources.id, me.resourceId)).returning();
  return NextResponse.json(updated);
}
