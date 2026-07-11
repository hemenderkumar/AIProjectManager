import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

// ADMIN-only, platform-wide view of the append-only audit log — every approval, rate
// change, role change, and org export/deletion, most recent first. Capped at 200 rows;
// this is a review tool, not a full audit-export mechanism (that's a bigger job for later
// if the customer base ever needs it).
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(200);
  return NextResponse.json(rows);
}
