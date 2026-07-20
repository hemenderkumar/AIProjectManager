import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, users, ideaReviewers } from "@/lib/db/schema";
import { eq, and, isNull, notInArray } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// Who's eligible to be pulled into an idea's alignment review: everyone in the SAME
// company as the project (or fellow internal staff, for an internal-only project) —
// "same company and group," per how this was originally described — minus whoever is
// already invited. A SUPER_USER (company owner) sees their whole org here, same as a PM.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [project] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const alreadyInvited = await db.select({ userId: ideaReviewers.userId }).from(ideaReviewers).where(eq(ideaReviewers.projectId, id));
  const excludeIds = alreadyInvited.map((r) => r.userId);

  const orgFilter = project.organizationId ? eq(users.organizationId, project.organizationId) : isNull(users.organizationId);
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(excludeIds.length ? and(orgFilter, notInArray(users.id, excludeIds)) : orgFilter);

  return NextResponse.json(rows);
}
