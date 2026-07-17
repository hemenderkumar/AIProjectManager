import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireRole, hashPassword } from "@/lib/auth";
import { generatePlaceholderPasswordHash, sendAccountSetupEmail } from "@/lib/passwordReset";

export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    resourceId: users.resourceId,
    organizationId: users.organizationId,
    createdAt: users.createdAt,
  }).from(users);
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !body.email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }
  // ADMIN and internal PM/CONTRIBUTOR/VIEWER staff have no organization (null). A SUPER_USER
  // must belong to one, since their whole visibility scope is "everything for my org."
  if (body.role === "SUPER_USER" && !body.organizationId) {
    return NextResponse.json({ error: "organizationId is required for a SUPER_USER" }, { status: 400 });
  }

  // Two ways to hand this person their first login: an admin types a temporary password
  // directly (body.password set), or — the default, so nobody but the user ever knows their
  // own password — a random unguessable placeholder is set and they get a one-time email
  // link to choose their own, same mechanism as a password reset.
  const passwordHash = body.password ? await hashPassword(body.password) : await generatePlaceholderPasswordHash();

  const [created] = await db
    .insert(users)
    .values({
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash,
      role: body.role ?? "VIEWER",
      resourceId: body.resourceId ?? null,
      organizationId: body.organizationId || null,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role, organizationId: users.organizationId });

  if (!body.password) {
    const { emailed, link } = await sendAccountSetupEmail(created, req.nextUrl.origin);
    return NextResponse.json({ ...created, emailed, setupLink: link }, { status: 201 });
  }

  return NextResponse.json(created, { status: 201 });
}
