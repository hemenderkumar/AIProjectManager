import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { PMO_GOVERNANCE_MODELS, invalidatePmoGovernanceCache } from "@/lib/pmoGovernance";
import { TERMINOLOGY_MODES, invalidateTerminologyModeCache } from "@/lib/prince2";

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
  if (typeof body.trialDays === "number" && body.trialDays >= 0) update.trialDays = Math.floor(body.trialDays);
  if (body.pmoGovernanceModel && PMO_GOVERNANCE_MODELS.includes(body.pmoGovernanceModel)) {
    update.pmoGovernanceModel = body.pmoGovernanceModel;
  }
  if (body.terminologyMode && TERMINOLOGY_MODES.includes(body.terminologyMode)) {
    update.terminologyMode = body.terminologyMode;
  }

  const [existing] = await db.select().from(settings).where(eq(settings.id, "default"));
  let result;
  if (!existing) {
    const [created] = await db.insert(settings).values({ id: "default", ...update }).returning();
    result = created;
  } else {
    const [updated] = await db.update(settings).set(update).where(eq(settings.id, "default")).returning();
    result = updated;
  }
  if ("pmoGovernanceModel" in update) invalidatePmoGovernanceCache();
  if ("terminologyMode" in update) invalidateTerminologyModeCache();
  return NextResponse.json(result);
}
