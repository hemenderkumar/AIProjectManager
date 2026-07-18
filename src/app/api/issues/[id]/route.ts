import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueReports } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

const VALID_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "WONT_FIX"];

// ADMIN-only status update on a reported issue — the event log's triage action. Stamps
// resolvedBy/resolvedAt when moved into a closed state (RESOLVED or WONT_FIX), clears them
// if it's reopened back to OPEN/IN_PROGRESS, so the fields always reflect the current state.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const closed = status === "RESOLVED" || status === "WONT_FIX";
  const [updated] = await db
    .update(issueReports)
    .set({
      status,
      resolvedBy: closed ? admin.name : null,
      resolvedAt: closed ? new Date() : null,
    })
    .where(eq(issueReports.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}
