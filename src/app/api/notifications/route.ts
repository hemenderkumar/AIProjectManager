import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// The current user's own notification feed (#262) -- newest first, capped at 50 so the bell
// dropdown never has to render an unbounded list. Unread count is derived client-side from
// this same payload (readAt == null) rather than a separate endpoint.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(50);

  return NextResponse.json(rows);
}
