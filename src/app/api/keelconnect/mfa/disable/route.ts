import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { verifyMfaToken } from "@/lib/keelconnect/mfa";
import { logAudit } from "@/lib/audit";

// Requires a currently-valid code (not just being logged in) to turn MFA off -- otherwise a
// hijacked session could disable the very control meant to protect Finance
// Approver/Platform-role actions. There's deliberately no "Platform Admin resets someone
// else's MFA" endpoint yet; that account-recovery path needs its own identity-verification
// process and is flagged as a follow-up, not silently left out.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db.select({ mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, user.id));
  if (!row?.mfaEnabled) return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "");
  if (!row.mfaSecret || !(await verifyMfaToken(row.mfaSecret, token))) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await db.update(users).set({ mfaEnabled: false, mfaSecret: null }).where(eq(users.id, user.id));
  await logAudit({ actor: user, action: "keelconnect.mfa.disabled", entityType: "user", entityId: user.id });

  return NextResponse.json({ ok: true });
}
