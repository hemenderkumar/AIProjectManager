import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prAgreementChangeRequests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessPrAgreement } from "@/lib/projectrequesta/access";

// Listing only -- creation happens as a side effect of PATCHing the agreement itself while
// it's ACTIVE (see api/projectrequesta/agreements/[agreementId]/route.ts), so there's no POST
// here. Visible to anyone who can see the agreement; deciding one (accept/reject) is a
// separate, more tightly-gated action -- see change-requests/[changeRequestId]/route.ts.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ agreementId: string }> }) {
  const { agreementId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessPrAgreement(user, agreementId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(prAgreementChangeRequests)
    .where(eq(prAgreementChangeRequests.prAgreementId, agreementId))
    .orderBy(prAgreementChangeRequests.createdAt);
  return NextResponse.json(rows);
}
