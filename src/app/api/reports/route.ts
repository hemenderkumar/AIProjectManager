import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireInternal } from "@/lib/tenancy";

export async function GET() {
  // Weekly status / steering committee reports are portfolio-wide, cross-client PMO
  // artifacts — internal staff only, never a client-company user regardless of role tier.
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await db.select().from(reports).orderBy(desc(reports.generatedAt)).limit(50);
  return NextResponse.json(all);
}
