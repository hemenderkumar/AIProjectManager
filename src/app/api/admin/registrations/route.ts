import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { registrationRequests } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await db
    .select({
      id: registrationRequests.id,
      type: registrationRequests.type,
      name: registrationRequests.name,
      email: registrationRequests.email,
      companyName: registrationRequests.companyName,
      status: registrationRequests.status,
      resultingUserId: registrationRequests.resultingUserId,
      requestedAt: registrationRequests.requestedAt,
      reviewedAt: registrationRequests.reviewedAt,
      reviewedBy: registrationRequests.reviewedBy,
    })
    .from(registrationRequests)
    .orderBy(desc(registrationRequests.requestedAt));
  return NextResponse.json(all);
}
