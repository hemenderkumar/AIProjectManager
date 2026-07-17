import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { createPasswordResetToken, buildResetLink } from "@/lib/passwordReset";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";

// Admin-initiated reset: instead of an admin inventing/typing a new password for someone
// (and having to communicate it to them out of band), this generates the same one-time link
// the self-service "forgot password" flow uses and emails it to the user. The link is also
// returned in the response so admin can copy/share it manually if RESEND_API_KEY isn't
// configured (same fallback pattern as the status-request "send update link" flow).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, id));
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const token = await createPasswordResetToken(user.id);
  const link = buildResetLink(token, req.nextUrl.origin);

  const emailed = await sendEmail(
    user.email,
    "Reset your Keel password",
    `Hi ${user.name},\n\nAn administrator has started a password reset for your Keel account. Set a new password here:\n\n${link}\n\nThis link expires in 1 hour.`
  ).catch(() => false);

  await logAudit({
    actor: admin, action: "user.password_reset_initiated", entityType: "user", entityId: user.id,
    detail: `${admin.name} initiated a password reset for ${user.name} (${user.email}).`,
  });

  return NextResponse.json({ link, emailed });
}
