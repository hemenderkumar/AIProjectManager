import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scDisputes } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScDispute, canAccessScProject, canAccessScAgreement, hasPlatformRole, getScMemberships } from "@/lib/keelconnect/access";
import { logAudit } from "@/lib/audit";
import { notifyScPlatform } from "@/lib/keelconnect/notify";

// Platform Compliance Officer/Admin see every dispute (cross-org mediation is their job per
// the spec); everyone else only sees disputes tied to a project/agreement they can already
// access. There's no single indexed query for "every dispute I'm a party to" without a much
// bigger join, so for non-platform users this filters in memory over the full table --
// acceptable at KeelConnect's expected scale, revisit if the disputes table gets large.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await getScMemberships(user.id);
  const all = await db.select().from(scDisputes);
  if (hasPlatformRole(memberships)) return NextResponse.json(all);

  const visible = [];
  for (const d of all) {
    if (await canAccessScDispute(user, { scProjectId: d.scProjectId, scAgreementId: d.scAgreementId })) visible.push(d);
  }
  return NextResponse.json(visible);
}

// Raised by anyone with access to the underlying Project or Agreement -- a Client or Vendor
// party, or Platform staff on their behalf. At least one of scProjectId/scAgreementId is
// required (a pre-award dispute has no Agreement yet).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const scProjectId = body.scProjectId ? String(body.scProjectId) : null;
  const scAgreementId = body.scAgreementId ? String(body.scAgreementId) : null;
  if (!scProjectId && !scAgreementId) {
    return NextResponse.json({ error: "scProjectId or scAgreementId is required" }, { status: 400 });
  }
  if (!body.description || !String(body.description).trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  if (scAgreementId && !(await canAccessScAgreement(user, scAgreementId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (scProjectId && !scAgreementId && !(await canAccessScProject(user, scProjectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [dispute] = await db
    .insert(scDisputes)
    .values({
      scProjectId,
      scAgreementId,
      raisedByUserId: user.id,
      description: String(body.description).trim(),
      status: "OPEN",
    })
    .returning();

  await logAudit({
    actor: user,
    action: "keelconnect.dispute.raised",
    entityType: "sc_dispute",
    entityId: dispute.id,
    afterValue: JSON.stringify(dispute),
  });

  // Dispute mediation is a Platform function (see canAccessScDispute) -- notify Platform
  // Admins immediately rather than waiting for someone to notice it in the queue.
  notifyScPlatform(
    "New KeelConnect dispute raised",
    `A dispute was raised: "${dispute.description}". Review it in the KeelConnect Admin Console.`
  ).catch(() => {});

  return NextResponse.json(dispute, { status: 201 });
}
