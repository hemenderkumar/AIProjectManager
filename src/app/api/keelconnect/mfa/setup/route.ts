import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { generateMfaSecret, buildOtpauthUrl, buildQrCodeDataUrl } from "@/lib/keelconnect/mfa";
import { logAudit } from "@/lib/audit";

// Step 1 of enrollment: generate a fresh secret, store it (not yet enabled -- mfaEnabled
// stays false until POST /api/keelconnect/mfa/verify confirms the user actually has it
// loaded in an authenticator app), and return a QR code to scan. Deliberately does NOT go
// through requireScPlatform/requireScOrgRole -- if it did, a Platform/Finance Approver user
// could never enroll in the first place, since those gates now require MFA to already be
// enabled. Any authenticated Keel user can call this; it has no effect until verified.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = generateMfaSecret();
  const otpauthUrl = buildOtpauthUrl(user.email, secret);
  const qrCodeDataUrl = await buildQrCodeDataUrl(otpauthUrl);

  await db.update(users).set({ mfaSecret: secret, mfaEnabled: false }).where(eq(users.id, user.id));

  await logAudit({ actor: user, action: "keelconnect.mfa.setup_started", entityType: "user", entityId: user.id });

  return NextResponse.json({ secret, otpauthUrl, qrCodeDataUrl });
}
