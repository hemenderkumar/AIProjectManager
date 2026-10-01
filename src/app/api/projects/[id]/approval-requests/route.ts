import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalRequests, projects, stakeholders } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { randomBytes } from "crypto";

// Gives the project's Sponsor stakeholder real approval authority instead of just being a
// name on the charter. Same tokenized no-login pattern as /api/status-requests — the token
// is the entire security boundary for the public /sponsor-approval/[token] page.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.projectId, id))
    .orderBy(desc(approvalRequests.requestedAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const entityType = ["CHARTER", "BUDGET_CHANGE_REQUEST", "GENERAL"].includes(body.entityType) ? body.entityType : "GENERAL";
  const summary = typeof body.summary === "string" ? body.summary.trim() : null;

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.sponsorStakeholderId) {
    return NextResponse.json({ error: "This project has no sponsor stakeholder set. Add one in the charter first." }, { status: 400 });
  }
  const [sponsor] = await db.select().from(stakeholders).where(eq(stakeholders.id, project.sponsorStakeholderId));
  if (!sponsor) return NextResponse.json({ error: "Sponsor stakeholder not found" }, { status: 404 });

  const token = randomBytes(24).toString("hex");
  const [created] = await db
    .insert(approvalRequests)
    .values({
      projectId: id,
      entityType,
      entityId: body.entityId ?? null,
      sponsorStakeholderId: sponsor.id,
      token,
      summary,
      requestedBy: user.name,
    })
    .returning();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const link = `${appUrl}/sponsor-approval/${token}`;

  let emailed = false;
  if (sponsor.email) {
    emailed = await sendEmail(
      sponsor.email,
      `Approval requested — ${project.name}`,
      `Hi ${sponsor.name},\n\n${user.name} is asking you to review and approve something on "${project.name}"${summary ? `:\n\n${summary}` : "."}\n\n${link}\n\nNo login needed — just click and record your decision.\n\nThanks,\nExecuta`
    );
  }

  await logAudit({
    actor: user,
    action: "approval_request.created",
    entityType: "approval_request",
    entityId: created.id,
    organizationId: project.organizationId,
    detail: `Requested ${entityType} approval from ${sponsor.name} on "${project.name}"`,
  });

  return NextResponse.json({ ...created, link, emailed }, { status: 201 });
}
