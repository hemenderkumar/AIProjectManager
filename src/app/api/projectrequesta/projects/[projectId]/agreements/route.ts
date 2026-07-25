import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prAgreements, prAgreementParties } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrProject } from "@/lib/projectrequesta/access";

// Convenience listing for a project's detail page -- the Agreement(s) generated when its
// winning bid was accepted (one for MARKETPLACE, two for MEDIATOR). Visibility follows the
// project's own access rule; a vendor who lost the bidding never had access to begin with,
// so this can't leak the awarded agreement to them. Each agreement embeds its own `parties`
// so the page can derive per-agreement clientOrgId/vendorOrgId (for permission checks on
// Send/Sign/Activate, milestone, and payment actions) without a second round trip per row.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessPrProject(user, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(prAgreements).where(eq(prAgreements.prProjectId, projectId));
  if (!rows.length) return NextResponse.json([]);

  const parties = await db
    .select()
    .from(prAgreementParties)
    .where(inArray(prAgreementParties.prAgreementId, rows.map((r) => r.id)));

  return NextResponse.json(
    rows.map((r) => ({ ...r, parties: parties.filter((p) => p.prAgreementId === r.id) }))
  );
}
