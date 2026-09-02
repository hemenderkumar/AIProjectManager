import { NextRequest, NextResponse } from "next/server";
import { sendPendingRegistrationsReminder } from "@/lib/registrationReminder";

// Daily nudge so a pending registration request never just sits unnoticed in Admin --
// sends one consolidated email (not one per request) listing every still-pending
// registration to every ADMIN. No-op (no email sent) when nothing is pending. See
// vercel.json for the schedule and /api/admin/registrations/remind for the manual
// "Send reminder" button that calls the same underlying helper.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await sendPendingRegistrationsReminder();
  return NextResponse.json({ ok: true, ...result });
}
