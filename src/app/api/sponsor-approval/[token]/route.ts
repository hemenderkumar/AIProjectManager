import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { approvalRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

// No-login sponsor decision endpoint. Like /api/update/[token] and /api/rfp-respond/[token],
// the token itself is the entire security boundary — this must only ever be able to touch
// the ONE approval_requests row that owns the token.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();

  const [reqRow] = await db.select().from(approvalRequests).where(eq(approvalRequests.token, token));
  if (!reqRow) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 404 });
  if (reqRow.status !== "PENDING") return NextResponse.json({ error: "A decision has already been recorded for this request." }, { status: 400 });

  const decision = body.decision === "APPROVED" || body.decision === "REJECTED" ? body.decision : null;
  if (!decision) return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });

  await db
    .update(approvalRequests)
    .set({
      status: decision,
      decisionNote: typeof body.decisionNote === "string" ? body.decisionNote.trim() || null : null,
      decidedAt: new Date(),
    })
    .where(eq(approvalRequests.id, reqRow.id));

  await logAudit({
    actor: null,
    action: `approval_request.${decision.toLowerCase()}`,
    entityType: "approval_request",
    entityId: reqRow.id,
    detail: `Sponsor recorded decision via tokenized link`,
  });

  return NextResponse.json({ ok: true });
}
