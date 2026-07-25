import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db";
import { prOrgMembers, users } from "../db/schema";
import { sendEmail } from "../email";
import type { PrRole } from "./access";

// Transactional email notifications for ProjectRequesta events (#257) -- new bid, counteroffer,
// bid accepted/rejected, agreement status change, milestone approved, payment released,
// dispute raised/resolved, review left. Every function here is deliberately best-effort:
// it's always called fire-and-forget from its route (`.catch(() => {})`, never awaited in a
// way that would fail the underlying action), and never throws past its own boundary --
// losing an email must never lose the bid/agreement/payment write it's describing.
async function emailsFor(prOrganizationId: string, roles?: PrRole[]): Promise<string[]> {
  const clauses = [eq(prOrgMembers.prOrganizationId, prOrganizationId)];
  if (roles?.length) clauses.push(inArray(prOrgMembers.role, roles));
  const rows = await db
    .select({ email: users.email })
    .from(prOrgMembers)
    .innerJoin(users, eq(prOrgMembers.userId, users.id))
    .where(and(...clauses));
  return [...new Set(rows.map((r) => r.email))];
}

export async function notifyPrOrg(prOrganizationId: string | null | undefined, subject: string, text: string, roles?: PrRole[]): Promise<void> {
  if (!prOrganizationId) return;
  try {
    const emails = await emailsFor(prOrganizationId, roles);
    await Promise.all(emails.map((e) => sendEmail(e, subject, text).catch(() => false)));
  } catch {
    // best-effort only -- a notification failure must never surface to the caller
  }
}

export async function notifyPrPlatform(subject: string, text: string): Promise<void> {
  try {
    const rows = await db
      .select({ email: users.email })
      .from(prOrgMembers)
      .innerJoin(users, eq(prOrgMembers.userId, users.id))
      .where(eq(prOrgMembers.role, "PLATFORM_ADMIN"));
    const emails = [...new Set(rows.map((r) => r.email))];
    await Promise.all(emails.map((e) => sendEmail(e, subject, text).catch(() => false)));
  } catch {
    // best-effort only
  }
}
