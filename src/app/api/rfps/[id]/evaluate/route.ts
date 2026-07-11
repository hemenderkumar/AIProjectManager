import { NextResponse } from "next/server";
import { requireOwnedRfp, evaluateRfp } from "@/lib/rfp";
import { logAudit } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { user, rfp } = guard;

  const result = await evaluateRfp(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  await logAudit({
    actor: user, action: "rfp.evaluated", entityType: "rfp", entityId: id,
    organizationId: user.organizationId, detail: `${user.name} ran AI vendor evaluation for RFP "${rfp.title}".`,
  });

  return NextResponse.json({ ok: true });
}
