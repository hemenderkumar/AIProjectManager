import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { sows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";
import { summarizeProjectCore } from "@/lib/projectContext";

type DriftResult = {
  status: "ON_TRACK" | "MINOR_DRIFT" | "SIGNIFICANT_DRIFT";
  summary: string;
  scheduleNote: string;
  fundingNote: string;
  scopeNote: string;
  recommendedActions: string[];
};

// Compares a signed SOW's baseline (scope/timeline/funding) against how the project is
// actually tracking right now, so drift shows up here instead of in a hard conversation with
// the vendor later. Read-only and ephemeral — nothing about the comparison is persisted.
export async function POST(req: NextRequest) {
  const { sowId } = await req.json().catch(() => ({}));
  if (!sowId) return NextResponse.json({ error: "sowId is required" }, { status: 400 });

  const [sow] = await db.select().from(sows).where(eq(sows.id, sowId));
  if (!sow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await requireProjectAccess("VIEWER", sow.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(sow.projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const system = `You are a PMO analyst comparing a vendor Statement of Work (SOW) against how the project is
actually tracking, to catch scope creep, schedule slippage, or funding overrun early. Be honest and specific
— if there isn't enough live project data yet to judge a dimension, say so plainly rather than guessing.

SOW baseline:
- Title: ${sow.title}
- Vendor: ${sow.vendorName}
- Status: ${sow.status}
- Scope: ${sow.scope || "(not specified)"}
- Timeline: ${sow.timeline || "(not specified)"}
- Funding: ${sow.fundingAmount != null ? `$${sow.fundingAmount.toLocaleString()}` : "(not specified)"}${
    sow.fundingTerms ? ` — ${sow.fundingTerms}` : ""
  }
- Risks noted at signing: ${sow.risks || "(none noted)"}
- Issues noted at signing: ${sow.issues || "(none noted)"}

Current project actuals:
${summarizeProjectCore(detail)}

Respond as JSON: { "status": "ON_TRACK"|"MINOR_DRIFT"|"SIGNIFICANT_DRIFT", "summary": string (2-3 sentences),
"scheduleNote": string (1-2 sentences), "fundingNote": string (1-2 sentences), "scopeNote": string (1-2
sentences), "recommendedActions": string[] (0-4 concrete next steps, empty if status is ON_TRACK) }`;

  const { data, error } = await askClaudeJSON<DriftResult>(system, "Assess drift now.", 2500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  return NextResponse.json(data);
}
