import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createPasswordResetToken, buildResetLink } from "@/lib/passwordReset";
import { sendEmail } from "@/lib/email";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent a password reset link.";

// Public — deliberately always returns the same generic message whether or not the email
// matches an account, and never reveals the reset link in the response (unlike the
// admin-initiated version). Otherwise this endpoint could be used to check which emails
// have accounts, or to reset someone else's password directly from the response body.
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.email, email.toLowerCase()));
  if (user) {
    const token = await createPasswordResetToken(user.id);
    const link = buildResetLink(token, req.nextUrl.origin);
    // Best-effort — the generic response above never depends on this succeeding, so there's
    // nothing to surface back to the caller either way.
    await sendEmail(
      user.email,
      "Reset your Keel password",
      `Hi ${user.name},\n\nSomeone requested a password reset for your Keel account. If this was you, set a new password here:\n\n${link}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`
    ).catch(() => false);
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
