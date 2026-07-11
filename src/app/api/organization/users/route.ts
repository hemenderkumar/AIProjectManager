import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireRole, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Roles a SUPER_USER is allowed to hand out to their own teammates. Deliberately excludes
// ADMIN (platform-wide) and SUPER_USER (account-owner tier) — only a Keel administrator
// can create another org owner or grant platform access, so an org can never accidentally
// lock itself out of ownership or escalate a teammate above the account owner.
const ASSIGNABLE_ROLES = ["PM", "CONTRIBUTOR", "VIEWER"] as const;

// Self-service: a SUPER_USER manages the other logins within their own organization —
// inviting a PM/CONTRIBUTOR/VIEWER teammate without needing a Keel administrator to do it
// for them. Every query is scoped to the caller's own organizationId; there's no way to see
// or touch a user outside it. Only teammates the SUPER_USER can actually manage are
// returned — their own account-owner row is excluded, so the UI never shows a role
// dropdown/remove button for a login this endpoint isn't allowed to touch.
export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, divisionId: users.divisionId, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.organizationId, user.organizationId), inArray(users.role, [...ASSIGNABLE_ROLES])));
  return NextResponse.json(orgUsers);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !body.email || !body.password) {
    return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
  }
  const role = ASSIGNABLE_ROLES.includes(body.role) ? body.role : "VIEWER";

  const passwordHash = await hashPassword(body.password);
  let created;
  try {
    [created] = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash,
        role,
        organizationId: user.organizationId,
      })
      .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  } catch {
    return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
  }

  await logAudit({
    actor: user,
    action: "user.created",
    entityType: "user",
    entityId: created.id,
    organizationId: user.organizationId,
    detail: `${user.name} invited ${created.name} (${created.email}) as ${created.role}.`,
  });

  return NextResponse.json(created, { status: 201 });
}
