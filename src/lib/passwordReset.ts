import { randomBytes } from "crypto";
import { db } from "./db";
import { passwordResetTokens } from "./db/schema";

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
