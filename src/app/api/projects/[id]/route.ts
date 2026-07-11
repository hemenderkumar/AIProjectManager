import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, stakeholders, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await getProjectDetail(id);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();

  const allowed = [
    "name", "description", "sponsor", "sponsorStakeholderId", "projectManager", "stage", "priority",
    "country", "stateProvince", "program",
    "ragStatus", "startDate", "targetEndDate", "actualEndDate", "budgetPlanned",
    "budgetActual", "percentComplete", "problemStatement", "proposedSolution",
    "expectedBenefits", "ideationNotes", "ideationAlignment", "ideaType", "ideationStatus", "businessCase", "objectives",
    "scopeInScope", "scopeOutOfScope", "deliverables", "successCriteria",
    "stakeholders", "assumptionsRisks", "risks", "totalFundingRequired",
    "integratedSystems", "highLevelArchitecture", "roiExpected",
    "charterApprovedBy", "charterApprovedAt",
    "feasibilityScore", "feasibilityNotes", "stageApprovedBy", "stageApprovedAt",
    "ongoingSupportMonthlyCost", "ongoingSupportPlan", "contingencyPercent",
    "pricingModel", "fixedBidPrice", "deliveryRationale", "deliveryRecommendedAt",
    "executionMethodology",
    "recommendedTechnology", "technicalRecommendationRationale", "technicalReviewStatus",
    "technicalReviewedBy", "technicalReviewedAt", "technicalReviewNotes",
    "highLevelRequirements", "architectureDiagram", "internalSupportNeeds",
  ];

  const dateFields = ["startDate", "targetEndDate", "actualEndDate", "charterApprovedAt", "stageApprovedAt", "deliveryRecommendedAt", "technicalReviewedAt"];
  const numericFields = ["budgetPlanned", "budgetActual", "percentComplete", "totalFundingRequired", "feasibilityScore", "ongoingSupportMonthlyCost", "contingencyPercent", "fixedBidPrice"];

  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) {
      const v = body[key];
      if (dateFields.includes(key)) {
        // An empty string (date input cleared, or never set) must become null, not "" —
        // Postgres rejects "" for a timestamp column and would fail the whole update.
        update[key] = v ? new Date(v) : null;
      } else if (numericFields.includes(key)) {
        // Same class of bug as dates: an empty/blank number input must become null,
        // not "" or NaN, or the whole update fails against a numeric column.
        update[key] = v === "" || v === null || Number.isNaN(Number(v)) ? null : Number(v);
      } else {
        update[key] = v;
      }
    }
  }

  // When a structured sponsor (stakeholder) is selected, denormalize their name into the
  // plain-text `sponsor` column too — every existing consumer (AI charter drafting, PDF/PPTX
  // exports, ideation reports) reads `sponsor` as text and shouldn't need to change.
  if ("sponsorStakeholderId" in body) {
    if (body.sponsorStakeholderId) {
      const [stakeholder] = await db
        .select({ name: stakeholders.name })
        .from(stakeholders)
        .where(eq(stakeholders.id, body.sponsorStakeholderId));
      if (stakeholder) update.sponsor = stakeholder.name;
    } else {
      update.sponsorStakeholderId = null;
    }
  }

  // Mapping a project to a company (or moving it between companies / back to internal-only)
  // is deliberately not in the general `allowed` list — it's a tenancy decision, not routine
  // field editing, so only a Keel administrator can make it, regardless of what role the
  // caller otherwise has on this project.
  let orgChanged = false;
  if ("organizationId" in body) {
    if (_authUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Only a Keel administrator can map a project to a company." }, { status: 403 });
    }
    const [existing] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, id));
    const newOrgId: string | null = body.organizationId || null;
    if (newOrgId) {
      const [org] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, newOrgId));
      if (!org) return NextResponse.json({ error: "That company does not exist." }, { status: 400 });
    }
    if (newOrgId !== (existing?.organizationId ?? null)) {
      orgChanged = true;
      update.organizationId = newOrgId;
      // The old stakeholder directory belongs to a different (or no) company — carrying a
      // stale sponsorStakeholderId forward would point at a stakeholder the new company (or
      // nobody, for internal-only) can even see. The plain-text `sponsor` name is left as-is
      // since it's just a label at that point.
      update.sponsorStakeholderId = null;
    }
  }

  const [updated] = await db
    .update(projects)
    .set(update)
    .where(eq(projects.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (orgChanged) {
    const [org] = updated.organizationId
      ? await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, updated.organizationId))
      : [null];
    await logAudit({
      actor: _authUser, action: "project.company_mapped", entityType: "project", entityId: id,
      organizationId: updated.organizationId, detail: `${_authUser.name} mapped project "${updated.name}" to ${org ? `company "${org.name}"` : "internal-only (no company)"}.`,
    });
  }

  // Audit the sensitive approval gates specifically, not every routine field edit — these
  // are the moments a decision was made, not just data entry.
  if ("charterApprovedAt" in body && body.charterApprovedAt) {
    await logAudit({
      actor: _authUser, action: "charter.approved", entityType: "project", entityId: id,
      organizationId: updated.organizationId, detail: `Charter approved by ${updated.charterApprovedBy ?? _authUser.name} for "${updated.name}".`,
    });
  }
  if ("stageApprovedAt" in body && body.stageApprovedAt) {
    await logAudit({
      actor: _authUser, action: "stage.approved", entityType: "project", entityId: id,
      organizationId: updated.organizationId, detail: `Stage approved by ${updated.stageApprovedBy ?? _authUser.name} for "${updated.name}" (now ${updated.stage}).`,
    });
  }
  if ("technicalReviewStatus" in body && body.technicalReviewStatus && body.technicalReviewStatus !== "PENDING") {
    await logAudit({
      actor: _authUser, action: "technical_review.decided", entityType: "project", entityId: id,
      organizationId: updated.organizationId, detail: `Technical review for "${updated.name}" set to ${updated.technicalReviewStatus} by ${updated.technicalReviewedBy ?? _authUser.name}.`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Deleting a whole project is irreversible and cascades to every task, milestone, sprint,
  // invoice, etc. underneath it — require PM tier or above, not just any contributor.
  const _authUser = await requireProjectAccess("PM", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [existing] = await db.select({ name: projects.name, organizationId: projects.organizationId }).from(projects).where(eq(projects.id, id));
  try {
    await db.delete(projects).where(eq(projects.id, id));
  } catch {
    return NextResponse.json(
      { error: "Could not delete this project — it may still be referenced by other records. Contact support if this persists." },
      { status: 409 }
    );
  }
  await logAudit({
    actor: _authUser, action: "project.deleted", entityType: "project", entityId: id,
    organizationId: existing?.organizationId ?? null, detail: `${_authUser.name} deleted project "${existing?.name ?? id}".`,
  });
  return NextResponse.json({ ok: true });
}
