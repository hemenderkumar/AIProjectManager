import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { buildIcsFeed } from "@/lib/ics";

// Public, unauthenticated calendar subscription feed -- same "opaque token, no session check"
// pattern as /api/update/[token] (status requests). A calendar app polls this URL on its own
// schedule, so it can't carry a login session; the token itself is the credential, and it's
// revocable independently (see /api/projects/[id]/calendar-token).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [project] = await db
    .select({ id: projects.id, name: projects.name, icsToken: projects.icsToken })
    .from(projects)
    .where(eq(projects.icsToken, token));
  if (!project) {
    return new NextResponse("Not found", { status: 404 });
  }

  const dueTasks = await db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.projectId, project.id), isNotNull(tasks.dueDate)));

  const body = buildIcsFeed(
    `Keel: ${project.name}`,
    dueTasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        uid: t.id,
        title: `${t.title} (${t.status.replace("_", " ")})`,
        description: `Task due date from Keel project "${project.name}".`,
        date: t.dueDate as Date,
      }))
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${project.name.replace(/[^a-z0-9]+/gi, "-")}-tasks.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
