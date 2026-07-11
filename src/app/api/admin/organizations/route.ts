import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

// Client companies (tenants). Kept intentionally minimal — name only — since the actual
// scoping is driven by organizationId on users/projects, not by anything stored here.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const [created] = await db.insert(organizations).values({ name: body.name.trim() }).returning();
  return NextResponse.json(created, { status: 201 });
}
