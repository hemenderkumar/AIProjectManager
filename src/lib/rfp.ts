import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfps, rfpCriteria, rfpVendors, rfpVendorScores, rfpRecommendations, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { askClaude, askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";

// Shared guard used by every /api/rfps/[id]/** route: fetch the RFP and confirm the caller
// is allowed to touch it. A SUPER_USER (client company owner) is confined to their own
// company's RFPs. An ADMIN (Keel staff) can act on ANY company's RFP — same "internal staff
// cross company lines" convention used for project access — since Vendor Evaluation is meant
// to be usable from the Admin side too, not just by a client logging in as their own owner.
export async function requireOwnedRfp(rfpId: string) {
  const user = await requireRole("SUPER_USER"); // roleAtLeast also passes ADMIN through
  if (!user) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  if (user.role !== "ADMIN" && !user.organizationId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }

  const [rfp] = await db.select().from(rfps).where(eq(rfps.id, rfpId));
  if (!rfp) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  if (user.role !== "ADMIN" && rfp.organizationId !== user.organizationId) {
    // 404, not 403 — don't confirm to a SUPER_USER that an RFP with this id exists at all
    // outside their own company.
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) } as const;
  }
  return { user, rfp } as const;
}

export type RfpRow = typeof rfps.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;

// Whether a project has a real, usable charter to draft an RFP from — mirrors the same
// "hasCharter" check used in OverviewTab.tsx (businessCase or objectives non-empty).
export function projectHasCharter(project: ProjectRow | null | undefined): boolean {
  return Boolean(project?.businessCase?.trim() || project?.objectives?.trim());
}

// Builds the raw input the AI draft is grounded in — either the linked project's charter
// (when one exists) or the owner-typed pointer fields on the RFP itself. Both shapes are
// folded into the same plain-text block so draftRfpContent() doesn't need to care which
// source it came from.
function buildDraftInputText(rfp: RfpRow, project: ProjectRow | null): string {
  if (project && projectHasCharter(project)) {
    return [
      `Project: ${project.name}`,
      project.description ? `Description: ${project.description}` : null,
      project.businessCase ? `Business case: ${project.businessCase}` : null,
      project.objectives ? `Objectives: ${project.objectives}` : null,
      project.scopeInScope ? `In scope: ${project.scopeInScope}` : null,
      project.scopeOutOfScope ? `Out of scope: ${project.scopeOutOfScope}` : null,
      project.deliverables ? `Deliverables: ${project.deliverables}` : null,
      project.successCriteria ? `Success criteria: ${project.successCriteria}` : null,
      project.startDate ? `Target start: ${new Date(project.startDate).toLocaleDateString("en-US")}` : null,
      project.targetEndDate ? `Target end: ${new Date(project.targetEndDate).toLocaleDateString("en-US")}` : null,
      project.totalFundingRequired ? `Approved funding: $${project.totalFundingRequired.toLocaleString()}` : null,
      project.integratedSystems ? `Systems to integrate with: ${project.integratedSystems}` : null,
      project.highLevelRequirements ? `High-level requirements: ${project.highLevelRequirements}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    rfp.background ? `Background: ${rfp.background}` : null,
    rfp.scope ? `Scope: ${rfp.scope}` : null,
    rfp.requirements ? `Requirements: ${rfp.requirements}` : null,
    rfp.timeline ? `Timeline: ${rfp.timeline}` : null,
    rfp.budgetRange ? `Budget range: ${rfp.budgetRange}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// Produces the full RFP document text vendors will read. Grounded either in a linked
// project's charter or in the owner's own pointer fields — never invents scope/budget
// numbers that weren't supplied.
export async function draftRfpContent(rfp: RfpRow, project: ProjectRow | null): Promise<string> {
  const inputText = buildDraftInputText(rfp, project);
  const system =
    "You are a procurement specialist drafting a professional Request for Proposal (RFP) document for a boutique " +
    "IT consultancy's client. Write clear, well-structured prose organized under headings (plain text headings " +
    "like 'Background', 'Scope of Work', 'Requirements', 'Timeline', 'Budget', 'Proposal Submission Instructions', " +
    "'Evaluation Criteria'). Do not invent specific numbers, dates, or facts that were not provided — if timeline " +
    "or budget wasn't given, ask vendors to propose their own instead of stating a figure. Keep it grounded, " +
    "concrete, and free of filler. No markdown formatting (no #, **, or bullets with dashes) — plain text only.";
  const user = `RFP title: ${rfp.title}\n\nInputs:\n${inputText || "(no additional detail provided — draft a reasonable general-purpose RFP structure the owner can fill in)"}`;
  return askClaude(system, user, 2000);
}

type VendorScoreDraft = { criterionId: string; score: number; rationale: string };
type EvaluationDraft = {
  vendorScores: { vendorId: string; scores: VendorScoreDraft[] }[];
  recommendedVendorId: string | null;
  summary: string;
};

// Scores every submitted vendor against the owner's weighted rubric and produces one overall
// recommendation. Vendors who never submitted a response are excluded — there's nothing to
// score. Returns null (with no writes) if there are no submitted vendors or no criteria yet.
export async function evaluateRfp(rfpId: string): Promise<{ ok: boolean; error?: string }> {
  const [rfp] = await db.select().from(rfps).where(eq(rfps.id, rfpId));
  if (!rfp) return { ok: false, error: "RFP not found." };

  const criteria = await db.select().from(rfpCriteria).where(eq(rfpCriteria.rfpId, rfpId));
  const vendors = await db.select().from(rfpVendors).where(eq(rfpVendors.rfpId, rfpId));
  const submitted = vendors.filter((v) => v.status === "SUBMITTED");

  if (criteria.length === 0) return { ok: false, error: "Add at least one scoring criterion before evaluating." };
  if (submitted.length === 0) return { ok: false, error: "No vendor has submitted a response yet." };

  const system =
    "You are an impartial vendor-evaluation analyst. Score each vendor's proposal against the given weighted " +
    "criteria on a 0-10 scale (10 = excellent fit, 0 = does not address it at all), with a one-to-two sentence " +
    "rationale per score grounded only in what the vendor actually wrote. Then pick ONE recommended vendor " +
    "(by id) and write a short overall summary (3-5 sentences) comparing pros/cons across vendors and explaining " +
    "the recommendation. Be objective — do not favor a vendor just because it answered at greater length.";

  const user = JSON.stringify({
    rfpTitle: rfp.title,
    rfpContent: rfp.content ?? "",
    criteria: criteria.map((c) => ({ id: c.id, name: c.name, weightPercent: c.weightPercent })),
    vendors: submitted.map((v) => ({
      id: v.id,
      name: v.name,
      responseText: v.responseText ?? "",
      proposedCost: v.proposedCost,
      proposedTimelineWeeks: v.proposedTimelineWeeks,
    })),
  });

  const schemaHint =
    "Respond with JSON of exactly this shape: " +
    '{"vendorScores":[{"vendorId":"<id>","scores":[{"criterionId":"<id>","score":0-10,"rationale":"..."}]}],' +
    '"recommendedVendorId":"<id or null>","summary":"..."}';

  const { data, error } = await askClaudeJSON<EvaluationDraft>(system, `${user}\n\n${schemaHint}`, 4096);
  if (!data) return { ok: false, error: error ?? "The AI evaluation failed." };

  for (const vs of data.vendorScores ?? []) {
    if (!submitted.some((v) => v.id === vs.vendorId)) continue;
    for (const s of vs.scores ?? []) {
      if (!criteria.some((c) => c.id === s.criterionId)) continue;
      await db
        .insert(rfpVendorScores)
        .values({
          rfpVendorId: vs.vendorId,
          criterionId: s.criterionId,
          score: Math.max(0, Math.min(10, Number(s.score) || 0)),
          rationale: s.rationale ?? null,
          createdByAi: true,
        })
        .onConflictDoUpdate({
          target: [rfpVendorScores.rfpVendorId, rfpVendorScores.criterionId],
          set: { score: Math.max(0, Math.min(10, Number(s.score) || 0)), rationale: s.rationale ?? null, createdByAi: true },
        });
    }
  }

  const recommendedVendorId = data.recommendedVendorId && submitted.some((v) => v.id === data.recommendedVendorId)
    ? data.recommendedVendorId
    : null;

  await db
    .insert(rfpRecommendations)
    .values({ rfpId, recommendedVendorId, summary: data.summary ?? null })
    .onConflictDoUpdate({
      target: rfpRecommendations.rfpId,
      set: { recommendedVendorId, summary: data.summary ?? null, generatedAt: new Date() },
    });

  await db.update(rfps).set({ status: "EVALUATING", updatedAt: new Date() }).where(eq(rfps.id, rfpId));

  return { ok: true };
}
