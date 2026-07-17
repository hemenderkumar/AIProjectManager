import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registrationRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [request] = await db.select().from(registrationRequests).where(eq(registrationRequests.id, id));
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "This request has already been reviewed." }, { status: 409 });
  }

  await db
    .update(registrationRequests)
    .set({ status: "REJECTED", reviewedAt: new Date(), reviewedBy: admin.name })
    .where(eq(registrationRequests.id, id));

  await logAudit({
    actor: admin,
    action: "registration.rejected",
    entityType: "registration_request",
    entityId: id,
    detail: `${admin.name} rejected the registration request from ${request.name} (${request.email}).`,
  });

  // Best-effort — a failed notification shouldn't undo the rejection.
  await sendEmail(
    request.email,
    "Your Keel access request",
    `Hi ${request.name},\n\nYour registration request was not approved. If you think this is a mistake, please reach out to your Keel administrator.`
  ).catch(() => false);

  return NextResponse.json({ ok: true }, { status: 200 });
}
