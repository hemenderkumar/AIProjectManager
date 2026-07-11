import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

// Self-service: a SUPER_USER's own organization record (name + any pending deletion
// request). Not for browsing other organizations — that's the ADMIN-only
// /api/admin/organizations route.
export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user || !user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [org] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(org);
}
