import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registrationRequests, users, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

// Public — no login required.
//
// COMPANY_OWNER requests never grant access by themselves: this only queues a request that
// an ADMIN must approve (see /api/admin/registrations/[id]/approve) before any real `users`
// row — and the brand-new organization/tenant that comes with it — exists.
//
// INDIVIDUAL requests are auto-provisioned immediately: the resulting account can't see
// anyone else's data until a PM/admin explicitly adds them to a project, so there is nothing
// sensitive for a waiting period to protect. The request row still gets created (status
// PENDING) purely so an admin can see it and, if it looks wrong, disable the account via
// reject — but the person can log in right away.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const type = body.type === "COMPANY_OWNER" ? "COMPANY_OWNER" : "INDIVIDUAL";
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const companyName = String(body.companyName ?? "").trim();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (type === "COMPANY_OWNER" && !companyName) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  // Reject duplicates against both real accounts and requests still awaiting a decision --
  // otherwise the same person (or someone else with that email) could queue up multiple
  // requests, or a request could sit unnoticed alongside an email that's already a real login.
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists. Try logging in instead." }, { status: 409 });
  }
  const [existingPending] = await db
    .select({ status: registrationRequests.status })
    .from(registrationRequests)
    .where(eq(registrationRequests.email, email));
  if (existingPending?.status === "PENDING") {
    // Only block on a still-pending request — a previously rejected/approved one shouldn't
    // stop someone from trying again.
    return NextResponse.json({ error: "A request for this email is already awaiting admin approval." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // INDIVIDUAL only: create the personal organization + real user row right now, same shape
  // as the admin approve route creates for one — see the file-level comment for why this is
  // safe to do without waiting on a human. A lightweight, invisible-to-them "personal"
  // organization keeps organizationId non-null (isInternalStaff() in tenancy.ts treats
  // organizationId === null as internal Keel staff, which would wrongly grant Resources/
  // Rate Cards/Admin access). An admin can still re-map them to a real company later.
  let resultingUserId: string | null = null;
  let resultingOrganizationId: string | null = null;
  if (type === "INDIVIDUAL") {
    const [org] = await db.insert(organizations).values({ name: `${name} (Individual)` }).returning();
    const [createdUser] = await db
      .insert(users)
      .values({ name, email, passwordHash, role: "CONTRIBUTOR", organizationId: org.id, verifiedAt: null })
      .returning({ id: users.id });
    resultingUserId = createdUser.id;
    resultingOrganizationId = org.id;
  }

  const [created] = await db
    .insert(registrationRequests)
    .values({
      type,
      name,
      email,
      passwordHash,
      companyName: type === "COMPANY_OWNER" ? companyName : null,
      resultingUserId,
      resultingOrganizationId,
    })
    .returning({ id: registrationRequests.id });

  // Best-effort notification — never block the registrant's confirmation on this succeeding.
  // In-app "Pending Registrations" on the Admin page is the reliable fallback either way.
  const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, "ADMIN"));
  const summary =
    type === "COMPANY_OWNER"
      ? `${name} (${email}) requested a company-owner account for "${companyName}" and is awaiting approval.`
      : `${name} (${email}) registered as an individual and can already log in — review it from Admin > Pending Registrations.`;
  await Promise.all(
    admins.map((a) =>
      sendEmail(a.email, "New Keel registration", `${summary}\n\nReview it from Admin > Pending Registrations.`).catch(() => false)
    )
  );

  return NextResponse.json({ id: created.id, immediateAccess: type === "INDIVIDUAL" }, { status: 201 });
}
