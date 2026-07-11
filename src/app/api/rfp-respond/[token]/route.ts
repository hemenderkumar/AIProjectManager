import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfpVendors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// No-login vendor submission endpoint. Like /api/update/[token], the token itself is the
// entire security boundary — this must only ever be able to touch the ONE vendor row that
// owns the token, never any other vendor's row or the RFP's rubric/other data.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();

  const [vendor] = await db.select().from(rfpVendors).where(eq(rfpVendors.token, token));
  if (!vendor) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 404 });
  if (vendor.status === "SUBMITTED") return NextResponse.json({ error: "You've already submitted a response." }, { status: 400 });

  if (body.decline) {
    await db.update(rfpVendors).set({ status: "DECLINED" }).where(eq(rfpVendors.id, vendor.id));
    return NextResponse.json({ ok: true });
  }

  if (!body.responseText?.trim()) {
    return NextResponse.json({ error: "responseText is required" }, { status: 400 });
  }

  await db
    .update(rfpVendors)
    .set({
      status: "SUBMITTED",
      responseText: body.responseText.trim(),
      proposedCost: body.proposedCost === null || body.proposedCost === undefined || Number.isNaN(Number(body.proposedCost)) ? null : Number(body.proposedCost),
      proposedTimelineWeeks: body.proposedTimelineWeeks === null || body.proposedTimelineWeeks === undefined || Number.isNaN(Number(body.proposedTimelineWeeks)) ? null : Number(body.proposedTimelineWeeks),
      submittedAt: new Date(),
    })
    .where(eq(rfpVendors.id, vendor.id));

  return NextResponse.json({ ok: true });
}
