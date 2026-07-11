import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, stakeholders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// Read-only list of the stakeholder directory for THIS project's organization — scoped by
// the project's own organizationId (via canAccessProject), not the caller's. This is what
// lets internal staff working on a client's project see that client's sponsor directory,
// even though internal staff have no organizationId of their own to key off of. Returns an
// empty list for internal-only projects (organizationId null) — there's no stakeholder
// directory to draw from until the project has an organization.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [project] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, id));
  if (!project?.organizationId) return NextResponse.json([]);

  const rows = await db.select().from(stakeholders).where(eq(stakeholders.organizationId, project.organizationId));
  return NextResponse.json(rows);
}
