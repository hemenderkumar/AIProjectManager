import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";

// Mirrors /api/me/theme -- a personal preference saved against the account, not the browser,
// so a dismissed checklist stays dismissed on any device this person logs into next.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.update(users).set({ onboardingDismissedAt: new Date() }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}
