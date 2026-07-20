import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { rfpVendors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

type DraftSowResult = {
  title: string;
  executiveSummary: string;
  scope: string;
  deliverablesSummary: string;
  timeline: string;
  fundingAmount: number | null;
  fundingTerms: string;
  risks: string;
  issues: string;
  content: string;
  milestones: { name: string; weekOffset: number }[];
};

export async function POST(req: NextRequest) {
  const { projectId, rfpVendorId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  // Drafting is part of creating the SOW, so it's gated the same as actually creating one.
  const user = await requireProjectAccess("SUPER_USER", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });
  const p = detail.project;

  let vendor: { name: string; contactName: string | null; contactEmail: string; proposedCost: number | null; proposedTimelineWeeks: number | null } | null = null;
  if (rfpVendorId) {
    const [v] = await db.select().from(rfpVendors).where(eq(rfpVendors.id, rfpVendorId));
    if (v) vendor = { name: v.name, contactName: v.contactName, contactEmail: v.contactEmail, proposedCost: v.proposedCost, proposedTimelineWeeks: v.proposedTimelineWeeks };
  }

  const system = `You are drafting a Statement of Work (SOW) between a company and a vendor for a project that
already has an approved charter and plan. Ground every section ONLY in the project details given below — do
not invent scope, budget figures, or commitments not implied by them. If a vendor's own proposal (cost/timeline)
is given, use it as the starting point for funding/timeline rather than re-deriving your own number. Write in a
formal, contract-appropriate register throughout — this is a document both parties sign — but "formal" is about
polish and phrasing, NOT brevity: every section should still be as thorough and detailed as its guidance calls
for; do not compress or thin out sections to sound more formal.

Respond as JSON: { "title": string,
"executiveSummary": string (3-5 sentences, standalone — what the vendor is engaged to do, the funding
  commitment, and the timeline, written so someone who reads ONLY this understands the engagement at a glance;
  it summarizes what follows, it does not replace the detailed sections below it),
"scope": string (2-4 sentences, what the vendor is engaged to deliver),
"deliverablesSummary": string (bulleted-style summary as plain text, one line per deliverable),
"timeline": string (narrative, e.g. phase breakdown), "fundingAmount": number or null,
"fundingTerms": string (e.g. payment schedule/milestones-based/net terms), "risks": string (contract-specific
risks — vendor dependency, IP, timeline slippage — not general project delivery risks),
"issues": string (known open items to resolve before/during engagement, or "None identified yet"),
"content": string (the full SOW document as plain text with clear section headers, suitable to send to the
vendor as-is), "milestones": [{ "name": string, "weekOffset": number (weeks from SOW start) }] with 3-6
entries }.`;

  const user_ = `Project: ${p.name}
Description: ${p.description || "(none)"}
Business case: ${p.businessCase || "(not yet defined)"}
Scope (in): ${p.scopeInScope || "(not yet defined)"}
Scope (out): ${p.scopeOutOfScope || "(not yet defined)"}
Charter deliverables: ${p.deliverables || "(not yet defined)"}
High-level requirements: ${p.highLevelRequirements || "(not yet defined)"}
Total funding required (project-wide estimate): ${p.totalFundingRequired ?? "(not estimated)"}
Target end date: ${p.targetEndDate ? new Date(p.targetEndDate).toDateString() : "(not set)"}
Country: ${p.country || "(not specified)"}
${vendor ? `Vendor: ${vendor.name}${vendor.contactName ? ` (contact: ${vendor.contactName})` : ""}
Vendor's proposed cost: ${vendor.proposedCost ?? "(not provided)"}
Vendor's proposed timeline: ${vendor.proposedTimelineWeeks ? `${vendor.proposedTimelineWeeks} weeks` : "(not provided)"}` : "No vendor selected yet — leave vendor-specific figures as reasonable placeholders the owner can fill in."}`;

  const { data, error } = await askClaudeJSON<DraftSowResult>(system, user_, 4000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  const today = new Date();
  const milestones = (data.milestones || []).map((m) => ({
    name: m.name,
    dueDate: new Date(today.getTime() + (m.weekOffset ?? 0) * 7 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  return NextResponse.json({
    title: data.title,
    executiveSummary: data.executiveSummary,
    vendorName: vendor?.name ?? "",
    vendorContactName: vendor?.contactName ?? "",
    vendorContactEmail: vendor?.contactEmail ?? "",
    scope: data.scope,
    deliverablesSummary: data.deliverablesSummary,
    timeline: data.timeline,
    fundingAmount: data.fundingAmount ?? vendor?.proposedCost ?? null,
    fundingTerms: data.fundingTerms,
    risks: data.risks,
    issues: data.issues,
    content: data.content,
    milestones,
  });
}
