import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prDisputes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrDispute, canAccessPrProject, canAccessPrAgreement, hasPlatformRole, getPrMemberships } from "@/lib/projectrequesta/access";
import { logAudit } from "@/lib/audit";
import { notifyPrPlatform } from "@/lib/projectrequesta/notify";

// Platform Compliance Officer/Admin see every dispute (cross-org mediation is their job per
// the spec); everyone else only sees disputes tied to a project/agreement they can already
// access. There's no single indexed query for "every dispute I'm a party to" without a much
// bigger join, so for non-platform users this filters in memory over the full table --
// acceptable at ProjectRequesta's expected scale, revisit if the disputes table gets large.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await getPrMemberships(user.id);
  const all = await db.select().from(prDisputes);
  if (hasPlatformRole(memberships)) return NextResponse.json(all);

  const visible = [];
  for (const d of all) {
    if (await canAccessPrDispute(user, { prProjectId: d.prProjectId, prAgreementId: d.prAgreementId })) visible.push(d);
  }
  return NextResponse.json(visible);
}

// Raised by anyone with access to the underlying Project or Agreement -- a Client or Vendor
// party, or Platform staff on their behalf. At least one of prProjectId/prAgreementId is
// required (a pre-award dispute has no Agreement yet).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const prProjectId = body.prProjectId ? String(body.prProjectId) : null;
  const prAgreementId = body.prAgreementId ? String(body.prAgreementId) : null;
  if (!prProjectId && !prAgreementId) {
    return NextResponse.json({ error: "prProjectId or prAgreementId is required" }, { status: 400 });
  }
  if (!body.description || !String(body.description).trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  if (prAgreementId && !(await canAccessPrAgreement(user, prAgreementId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (prProjectId && !prAgreementId && !(await canAccessPrProject(user, prProjectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [dispute] = await db
    .insert(prDisputes)
    .values({
      prProjectId,
      prAgreementId,
      raisedByUserId: user.id,
      description: String(body.description).trim(),
      status: "OPEN",
    })
    .returning();

  await logAudit({
    actor: user,
    action: "projectrequesta.dispute.raised",
    entityType: "pr_dispute",
    entityId: dispute.id,
    afterValue: JSON.stringify(dispute),
  });

  // Dispute mediation is a Platform function (see canAccessPrDispute) -- notify Platform
  // Admins immediately rather than waiting for someone to notice it in the queue.
  notifyPrPlatform(
    "New ProjectRequesta dispute raised",
    `A dispute was raised: "${dispute.description}". Review it in the ProjectRequesta Admin Console.`
  ).catch(() => {});

  return NextResponse.json(dispute, { status: 201 });
}
