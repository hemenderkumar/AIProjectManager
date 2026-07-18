import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registrationRequests, organizations, users } from "@/lib/db/schema";
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

  // INDIVIDUAL requests already have their user + personal organization created at
  // registration time (see /api/auth/register) — this row is only here for admin visibility.
  // "Approving" one just marks it reviewed; there is no account left to create.
  if (request.type === "INDIVIDUAL" && request.resultingUserId) {
    await db
      .update(registrationRequests)
      .set({ status: "APPROVED", reviewedAt: new Date(), reviewedBy: admin.name })
      .where(eq(registrationRequests.id, id));

    await logAudit({
      actor: admin,
      action: "registration.approved",
      entityType: "user",
      entityId: request.resultingUserId,
      organizationId: request.resultingOrganizationId,
      detail: `${admin.name} reviewed and confirmed the auto-provisioned individual account for ${request.name} (${request.email}).`,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, request.email));
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists. Reject this request instead." }, { status: 409 });
  }

  // INDIVIDUAL: a lightweight, invisible-to-them "personal" organization, purely so
  // organizationId is non-null — isInternalStaff() in tenancy.ts treats organizationId === null
  // as internal Keel staff, which would wrongly grant them Resources/Rate Cards/Admin access.
  // An admin can still re-map them to a real company later from Users & roles, same as any
  // other user. COMPANY_OWNER: a real named organization, mirroring the existing "New Company"
  // admin flow (org + its first SUPER_USER owner, created together).
  const orgName = request.type === "COMPANY_OWNER" ? request.companyName! : `${request.name} (Individual)`;
  const [org] = await db.insert(organizations).values({ name: orgName }).returning();

  const [createdUser] = await db
    .insert(users)
    .values({
      name: request.name,
      email: request.email,
      passwordHash: request.passwordHash,
      role: request.type === "COMPANY_OWNER" ? "SUPER_USER" : "CONTRIBUTOR",
      organizationId: org.id,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, organizationId: users.organizationId });

  await db
    .update(registrationRequests)
    .set({
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewedBy: admin.name,
      resultingUserId: createdUser.id,
      resultingOrganizationId: org.id,
    })
    .where(eq(registrationRequests.id, id));

  await logAudit({
    actor: admin,
    action: "registration.approved",
    entityType: "user",
    entityId: createdUser.id,
    organizationId: org.id,
    detail: `${admin.name} approved ${request.type === "COMPANY_OWNER" ? "company-owner" : "individual"} registration for ${request.name} (${request.email}).`,
  });

  // Best-effort — the request already succeeded either way; this just lets them know sooner.
  await sendEmail(
    request.email,
    "Your Keel access has been approved",
    `Hi ${request.name},\n\nYour registration request has been approved. You can log in now with the email and password you signed up with.`
  ).catch(() => false);

  return NextResponse.json({ user: createdUser, organization: org }, { status: 200 });
}
