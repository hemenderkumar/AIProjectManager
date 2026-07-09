import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { reports } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await db.select().from(reports).orderBy(desc(reports.generatedAt)).limit(50);
  return NextResponse.json(all);
}
