import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { resources } from "@/lib/db/schema";
import { requireInternal } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

const allowed = [
  "name",
  "role",
  "email",
  "capacityHoursPerWk",
  "costPerHour",
  "skills",
  "experienceYears",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireInternal("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const [before] = await db.select({ costPerHour: resources.costPerHour, name: resources.name }).from(resources).where(eq(resources.id, id));

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      update[key] = key === "skills" && !Array.isArray(body[key]) ? null : body[key];
    }
  }

  const [updated] = await db
    .update(resources)
    .set(update)
    .where(eq(resources.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if ("costPerHour" in body && before && before.costPerHour !== updated.costPerHour) {
    await logAudit({
      actor: _authUser, action: "resource.rate_changed", entityType: "resource", entityId: id,
      detail: `${_authUser.name} changed ${updated.name}'s rate from $${before.costPerHour ?? 0}/hr to $${updated.costPerHour ?? 0}/hr.`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireInternal("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  try {
    await db.delete(resources).where(eq(resources.id, id));
  } catch {
    // Most likely a foreign key violation: this resource is still assigned to
    // tasks, allocated on a project, or linked to a user login.
    return NextResponse.json(
      {
        error:
          "Can't delete this resource — it's still assigned to tasks, allocated to a project, " +
          "or linked to a user login. Reassign or remove those first.",
      },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
