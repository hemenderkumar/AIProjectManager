import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registrationRequests, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

// Public — no login required. Submitting this never grants access by itself: it only queues
// a request that an ADMIN must approve from the Admin page (see
// /api/admin/registrations/[id]/approve) before any real `users` row exists.
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
  const [created] = await db
    .insert(registrationRequests)
    .values({
      type,
      name,
      email,
      passwordHash,
      companyName: type === "COMPANY_OWNER" ? companyName : null,
    })
    .returning({ id: registrationRequests.id });

  // Best-effort notification — never block the registrant's confirmation on this succeeding.
  // In-app "Pending Registrations" on the Admin page is the reliable fallback either way.
  const admins = await db.select({ email: users.email }).from(users).where(eq(users.role, "ADMIN"));
  const summary =
    type === "COMPANY_OWNER"
      ? `${name} (${email}) requested a company-owner account for "${companyName}".`
      : `${name} (${email}) requested an individual account.`;
  await Promise.all(
    admins.map((a) =>
      sendEmail(
        a.email,
        "New Keel registration awaiting approval",
        `${summary}\n\nReview it from Admin > Pending Registrations.`
      ).catch(() => false)
    )
  );

  return NextResponse.json({ id: created.id }, { status: 201 });
}
