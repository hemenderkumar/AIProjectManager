import { randomBytes } from "crypto";
import { db } from "./db";
import { passwordResetTokens } from "./db/schema";
import { hashPassword } from "./auth";
import { sendEmail } from "./email";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — short-lived, single-use

/** Creates a one-time reset token for a user and returns it. Used by both the self-service
 * "forgot password" flow and an admin-initiated reset — same token shape either way, since
 * the only difference between them is who triggered it, not what the link does. */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await db.insert(passwordResetTokens).values({
    token,
    userId,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });
  return token;
}

export function buildResetLink(token: string, origin: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin;
  return `${appUrl}/reset-password/${token}`;
}

// Pulled out as its own function (rather than inlined at the call site) so the impure
// Date.now() call doesn't live directly inside a page/server component's render body.
export function isResetTokenValid(row: { usedAt: Date | null; expiresAt: Date } | undefined): boolean {
  if (!row || row.usedAt) return false;
  return row.expiresAt.getTime() > Date.now();
}

// A long, random password nobody (including the admin who created the account) ever sees —
// used when a new user is set up via "send them a setup link" instead of an admin typing a
// temporary password. The only way in is the setup-link email below, same one-time-token
// mechanism as a password reset.
export async function generatePlaceholderPasswordHash(): Promise<string> {
  return hashPassword(randomBytes(32).toString("hex"));
}

// Sends a brand-new user their one-time "set your password" link and returns whether the
// email actually went out, plus the raw link either way — so the caller (an admin or org
// owner's UI) can show the link directly if RESEND_API_KEY isn't configured, same fallback
// used for admin-initiated resets.
export async function sendAccountSetupEmail(
  user: { id: string; name: string; email: string },
  origin: string
): Promise<{ emailed: boolean; link: string }> {
  const token = await createPasswordResetToken(user.id);
  const link = buildResetLink(token, origin);
  const emailed = await sendEmail(
    user.email,
    "Set up your Keel account",
    `Hi ${user.name},\n\nAn account has been created for you on Keel. Set your password to get started:\n\n${link}\n\nThis link expires in 1 hour.`
  ).catch(() => false);
  return { emailed, link };
}
