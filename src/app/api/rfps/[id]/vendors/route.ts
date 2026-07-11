import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfpVendors } from "@/lib/db/schema";
import { requireOwnedRfp } from "@/lib/rfp";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { randomBytes } from "crypto";

// Invites one vendor to respond to an RFP — same no-login, tokenized-link pattern as the
// existing status-request flow. The token is the vendor's SOLE credential: it must only ever
// resolve this one vendor's own row (see /api/rfp-respond/[token]), never the rubric weights
// or any other vendor's response.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { user, rfp } = guard;

  const body = await req.json();
  if (!body.name?.trim() || !body.contactEmail?.trim()) {
    return NextResponse.json({ error: "name and contactEmail are required" }, { status: 400 });
  }

  const token = randomBytes(24).toString("hex");
  const [created] = await db
    .insert(rfpVendors)
    .values({
      rfpId: id,
      name: body.name.trim(),
      contactName: body.contactName || null,
      contactEmail: body.contactEmail.trim().toLowerCase(),
      token,
    })
    .returning();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const link = `${appUrl}/rfp/respond/${token}`;

  const emailed = await sendEmail(
    created.contactEmail,
    `RFP invitation — ${rfp.title}`,
    `Hi ${created.contactName || created.name},\n\nYou've been invited to respond to a Request for Proposal: "${rfp.title}".\n\n${link}\n\nNo login needed — just click the link to review the RFP and submit your proposal.\n\nThanks,\n${user.name}`
  );

  await logAudit({
    actor: user, action: "rfp.vendor_invited", entityType: "rfp", entityId: id,
    organizationId: user.organizationId, detail: `${user.name} invited ${created.name} to RFP "${rfp.title}".`,
  });

  return NextResponse.json({ ...created, link, emailed }, { status: 201 });
}
