import { db } from "@/lib/db";
import { registrationRequests, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";

// One consolidated reminder email -- NOT one email per pending request -- listing every
// still-PENDING registration, sent to every ADMIN. Shared by two callers: the daily cron
// (/api/cron/pending-registrations-reminder) and the "Send reminder" button in
// Admin > Pending Registrations (/api/admin/registrations/remind POST). Deliberately
// separate from the per-registration notification in /api/auth/register, which fires once,
// immediately, per new request -- this is the follow-up nudge for anything that's been
// sitting there unactioned.
export async function sendPendingRegistrationsReminder(): Promise<{ pendingCount: number; emailed: number }> {
  const pending = await db
    .select({
      name: registrationRequests.name,
      email: registrationRequests.email,
      type: registrationRequests.type,
      companyName: registrationRequests.companyName,
      requestedAt: registrationRequests.requestedAt,
    })
    .from(registrationRequests)
    .where(eq(registrationRequests.status, "PENDING"));

  if (!pending.length) return { pendingCount: 0, emailed: 0 };

  const lines = pending
    .map((r) => {
      const days = Math.floor((Date.now() - new Date(r.requestedAt).getTime()) / 86_400_000);
      const waited = days <= 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;
      const kind = r.type === "COMPANY_OWNER" ? `company owner — ${r.companyName}` : "individual";
      return `- ${r.name} <${r.email}> (${kind}) — requested ${waited}`;
    })
    .join("\n");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const subject = `${pending.length} registration${pending.length === 1 ? "" : "s"} awaiting your review`;
  const body =
    `The following registration${pending.length === 1 ? " is" : "s are"} still pending approval in Executa:\n\n` +
    `${lines}\n\nReview them at ${appUrl}/admin.`;

  const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, "ADMIN"));
  let emailed = 0;
  for (const a of admins) {
    const ok = await sendEmail(a.email, subject, body);
    if (ok) emailed += 1;
  }
  return { pendingCount: pending.length, emailed };
}
