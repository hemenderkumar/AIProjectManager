import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registrationRequests, users } from "@/lib/db/schema";
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

  // INDIVIDUAL requests already have a live, logged-in-capable account (auto-provisioned at
  // registration time) — rejecting the request on its own wouldn't actually stop them from
  // logging in, since login only checks the `users` table. Disable that account explicitly.
  if (request.type === "INDIVIDUAL" && request.resultingUserId) {
    await db
      .update(users)
      .set({ disabledAt: new Date(), disabledReason: `Registration rejected by ${admin.name}` })
      .where(eq(users.id, request.resultingUserId));
  }

  await logAudit({
    actor: admin,
    action: "registration.rejected",
    entityType: "registration_request",
    entityId: id,
    detail:
      request.type === "INDIVIDUAL" && request.resultingUserId
        ? `${admin.name} rejected and disabled the account for ${request.name} (${request.email}).`
        : `${admin.name} rejected the registration request from ${request.name} (${request.email}).`,
  });

  // Best-effort — a failed notification shouldn't undo the rejection.
  await sendEmail(
    request.email,
    "Your Keel access request",
    request.type === "INDIVIDUAL" && request.resultingUserId
      ? `Hi ${request.name},\n\nYour Keel account access has been disabled. If you think this is a mistake, please reach out to your Keel administrator.`
      : `Hi ${request.name},\n\nYour registration request was not approved. If you think this is a mistake, please reach out to your Keel administrator.`
  ).catch(() => false);

  return NextResponse.json({ ok: true }, { status: 200 });
}
