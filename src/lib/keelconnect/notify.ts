import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db";
import { scOrgMembers, users } from "../db/schema";
import { sendEmail } from "../email";
import type { ScRole } from "./access";

// Transactional email notifications for KeelConnect events (#257) -- new bid, counteroffer,
// bid accepted/rejected, agreement status change, milestone approved, payment released,
// dispute raised/resolved, review left. Every function here is deliberately best-effort:
// it's always called fire-and-forget from its route (`.catch(() => {})`, never awaited in a
// way that would fail the underlying action), and never throws past its own boundary --
// losing an email must never lose the bid/agreement/payment write it's describing.
async function emailsFor(scOrganizationId: string, roles?: ScRole[]): Promise<string[]> {
  const clauses = [eq(scOrgMembers.scOrganizationId, scOrganizationId)];
  if (roles?.length) clauses.push(inArray(scOrgMembers.role, roles));
  const rows = await db
    .select({ email: users.email })
    .from(scOrgMembers)
    .innerJoin(users, eq(scOrgMembers.userId, users.id))
    .where(and(...clauses));
  return [...new Set(rows.map((r) => r.email))];
}

export async function notifyScOrg(scOrganizationId: string | null | undefined, subject: string, text: string, roles?: ScRole[]): Promise<void> {
  if (!scOrganizationId) return;
  try {
    const emails = await emailsFor(scOrganizationId, roles);
    await Promise.all(emails.map((e) => sendEmail(e, subject, text).catch(() => false)));
  } catch {
    // best-effort only -- a notification failure must never surface to the caller
  }
}

export async function notifyScPlatform(subject: string, text: string): Promise<void> {
  try {
    const rows = await db
      .select({ email: users.email })
      .from(scOrgMembers)
      .innerJoin(users, eq(scOrgMembers.userId, users.id))
      .where(eq(scOrgMembers.role, "PLATFORM_ADMIN"));
    const emails = [...new Set(rows.map((r) => r.email))];
    await Promise.all(emails.map((e) => sendEmail(e, subject, text).catch(() => false)));
  } catch {
    // best-effort only
  }
}
