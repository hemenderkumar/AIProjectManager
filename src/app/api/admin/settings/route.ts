import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [row] = await db.select().from(settings).where(eq(settings.id, "default"));
  if (!row) {
    const [created] = await db.insert(settings).values({ id: "default" }).returning();
    return NextResponse.json(created);
  }
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.weeklyReportCadence) update.weeklyReportCadence = body.weeklyReportCadence;
  if (body.steeringCadence) update.steeringCadence = body.steeringCadence;
  if (body.avatarVoiceGender) update.avatarVoiceGender = body.avatarVoiceGender;

  const [existing] = await db.select().from(settings).where(eq(settings.id, "default"));
  if (!existing) {
    const [created] = await db.insert(settings).values({ id: "default", ...update }).returning();
    return NextResponse.json(created);
  }
  const [updated] = await db.update(settings).set(update).where(eq(settings.id, "default")).returning();
  return NextResponse.json(updated);
}
