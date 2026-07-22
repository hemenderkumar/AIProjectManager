import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, projects as deliverProjects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScProject } from "@/lib/keelconnect/access";
import { requireProjectAccess } from "@/lib/tenancy";

// Reverse lookup for the one-way tasks.scProjectId bridge (see
// /api/projects/[id]/tasks/[taskId]/post-to-keelconnect) -- lets a KeelConnect project page
// show "this came from Keel Deliver task X in project Y" when a Deliver task was posted here.
// Deliberately returns null (not 403) when the caller can't see the internal Deliver project
// -- a Vendor bidding on the marketplace posting has every right to see the KeelConnect
// project itself, but never Keel's internal project/task naming, so the link only renders
// for whichever Deliver-side users already have access to that project.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScProject(user, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [task] = await db.select().from(tasks).where(eq(tasks.scProjectId, projectId));
  if (!task) return NextResponse.json(null);

  const deliverUser = await requireProjectAccess("VIEWER", task.projectId);
  if (!deliverUser) return NextResponse.json(null);

  const [deliverProject] = await db
    .select({ id: deliverProjects.id, name: deliverProjects.name })
    .from(deliverProjects)
    .where(eq(deliverProjects.id, task.projectId));

  return NextResponse.json({
    taskId: task.id,
    taskTitle: task.title,
    deliverProjectId: task.projectId,
    deliverProjectName: deliverProject?.name ?? "Untitled project",
  });
}
