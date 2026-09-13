import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { satisfactionSurveys, projects } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { randomBytes } from "crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(satisfactionSurveys)
    .where(eq(satisfactionSurveys.projectId, id))
    .orderBy(desc(satisfactionSurveys.sentAt));
  return NextResponse.json(rows);
}

// Sends a no-login satisfaction survey link -- same tokenized-link shape as status-requests,
// see the comment on satisfactionSurveys in schema.ts. CONTRIBUTOR+ (same tier that can log a
// status update), since sending one is a routine act of following up, not something that needs
// approver-level gating.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const respondentEmail = body.respondentEmail ? String(body.respondentEmail).trim() : null;
  const token = randomBytes(24).toString("hex");

  const [created] = await db
    .insert(satisfactionSurveys)
    .values({
      token,
      projectId: id,
      triggerType: body.triggerType || "MANUAL",
      milestoneId: body.milestoneId || null,
      respondentName: body.respondentName || null,
      respondentEmail,
      sentBy: user.name,
    })
    .returning();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const link = `${appUrl}/satisfaction/${token}`;

  let emailed = false;
  if (respondentEmail) {
    emailed = await sendEmail(
      respondentEmail,
      `Quick feedback — ${project.name}`,
      `Hi${body.respondentName ? ` ${body.respondentName}` : ""},\n\nCould you share a quick, two-question read on how "${project.name}" is going?\n\n${link}\n\nNo login needed — just click and answer.\n\nThanks,\n${user.name}`
    );
  }

  await logAudit({
    actor: user,
    action: "satisfaction_survey.sent",
    entityType: "satisfaction_survey",
    entityId: created.id,
    detail: `${user.name} sent a satisfaction survey for "${project.name}"${respondentEmail ? ` to ${respondentEmail}` : ""}.`,
  });

  return NextResponse.json({ ...created, link, emailed }, { status: 201 });
}
