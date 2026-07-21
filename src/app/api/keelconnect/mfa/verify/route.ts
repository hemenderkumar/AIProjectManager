import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { verifyMfaToken } from "@/lib/keelconnect/mfa";
import { logAudit } from "@/lib/audit";

// Step 2 of enrollment: prove the authenticator app is actually working by submitting one
// live code before mfaEnabled flips to true. Without this step, a user could "enable" MFA
// without ever successfully scanning the QR code, then get permanently locked out the first
// time a gated route demands a code they've never received.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db.select({ mfaSecret: users.mfaSecret }).from(users).where(eq(users.id, user.id));
  if (!row?.mfaSecret) return NextResponse.json({ error: "Call /api/keelconnect/mfa/setup first" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  if (!(await verifyMfaToken(row.mfaSecret, token))) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await db.update(users).set({ mfaEnabled: true }).where(eq(users.id, user.id));
  await logAudit({ actor: user, action: "keelconnect.mfa.enabled", entityType: "user", entityId: user.id });

  return NextResponse.json({ ok: true });
}
