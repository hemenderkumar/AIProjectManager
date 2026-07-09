import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { statusRequests, resources, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { projectId, taskId, resourceId, message } = await req.json();
  if (!projectId || !resourceId) {
    return NextResponse.json({ error: "projectId and resourceId are required" }, { status: 400 });
  }

  const [resource] = await db.select().from(resources).where(eq(resources.id, resourceId));
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!resource || !project) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const token = randomBytes(24).toString("hex");
  await db.insert(statusRequests).values({
    token,
    projectId,
    taskId: taskId ?? null,
    resourceId,
    message: message ?? null,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const link = `${appUrl}/update/${token}`;

  let emailed = false;
  if (resource.email) {
    emailed = await sendEmail(
      resource.email,
      `Status update requested — ${project.name}`,
      `Hi ${resource.name},\n\nCan you share a quick status update for "${project.name}"?\n\n${link}\n\nNo login needed — just click and fill in a few lines.\n\nThanks,\nAI PM`
    );
  }

  return NextResponse.json({ link, emailed });
}
