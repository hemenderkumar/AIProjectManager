import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations, users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireRole, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Client companies (tenants). Kept intentionally minimal — name only — since the actual
// scoping is driven by organizationId on users/projects, not by anything stored here.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
  return NextResponse.json(all);
}

// Creates the company and — when owner details are supplied — its first SUPER_USER account
// in one step. A company without any SUPER_USER is a dead end (nobody at that client can log
// in to manage their own team, divisions, stakeholders, or vendor evaluations), so the admin
// UI always collects owner details up front rather than treating this as a separate action.
export async function POST(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const hasOwner = body.ownerName && body.ownerEmail && body.ownerPassword;
  if ((body.ownerName || body.ownerEmail || body.ownerPassword) && !hasOwner) {
    return NextResponse.json({ error: "Owner name, email, and password are all required to create the owner account." }, { status: 400 });
  }

  const [created] = await db.insert(organizations).values({ name: body.name.trim() }).returning();

  let owner = null;
  if (hasOwner) {
    try {
      const passwordHash = await hashPassword(body.ownerPassword);
      [owner] = await db
        .insert(users)
        .values({
          name: body.ownerName,
          email: String(body.ownerEmail).toLowerCase(),
          passwordHash,
          role: "SUPER_USER",
          organizationId: created.id,
        })
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role, organizationId: users.organizationId });
    } catch {
      // The org itself was created successfully even if the owner account couldn't be (e.g.
      // duplicate email) — surface that partial state rather than silently losing the org.
      return NextResponse.json(
        { organization: created, owner: null, error: "Company was created, but the owner account could not be created — that email may already be in use. Add the owner from Users & roles below." },
        { status: 207 }
      );
    }
  }

  await logAudit({
    actor: admin, action: "organization.created", entityType: "organization", entityId: created.id,
    organizationId: created.id, detail: `${admin.name} created company "${created.name}"${owner ? ` with owner ${owner.name} (${owner.email})` : ""}.`,
  });

  return NextResponse.json({ organization: created, owner }, { status: 201 });
}
