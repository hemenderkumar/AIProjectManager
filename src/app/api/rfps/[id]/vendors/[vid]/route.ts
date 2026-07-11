import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rfpVendors } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOwnedRfp } from "@/lib/rfp";
import { logAudit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; vid: string }> }) {
  const { id, vid } = await params;
  const guard = await requireOwnedRfp(id);
  if ("error" in guard) return guard.error;
  const { user, rfp } = guard;

  const [target] = await db.select({ name: rfpVendors.name }).from(rfpVendors).where(and(eq(rfpVendors.id, vid), eq(rfpVendors.rfpId, id)));
  await db.delete(rfpVendors).where(and(eq(rfpVendors.id, vid), eq(rfpVendors.rfpId, id)));

  if (target) {
    await logAudit({
      actor: user, action: "rfp.vendor_removed", entityType: "rfp", entityId: id,
      organizationId: user.organizationId, detail: `${user.name} removed vendor ${target.name} from RFP "${rfp.title}".`,
    });
  }

  return NextResponse.json({ ok: true });
}
