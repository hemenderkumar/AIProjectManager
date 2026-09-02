import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendPendingRegistrationsReminder } from "@/lib/registrationReminder";

// Manual trigger for the "Send reminder" button in Admin > Pending Registrations --
// sends the same one-email-with-everything-pending reminder as the daily cron
// (/api/cron/pending-registrations-reminder), on demand.
export async function POST() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await sendPendingRegistrationsReminder();
  return NextResponse.json(result);
}
