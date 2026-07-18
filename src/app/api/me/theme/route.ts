import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser, VALID_THEMES } from "@/lib/auth";

// Any logged-in user can set their own theme — it's a personal preference, not scoped by
// role or organization. Saved against the account (not the browser) so it follows them to
// any device they log into next — see getCurrentTheme() in lib/auth.ts.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const theme = String(body?.theme ?? "");
  if (!VALID_THEMES.includes(theme as (typeof VALID_THEMES)[number])) {
    return NextResponse.json({ error: "Unknown theme" }, { status: 400 });
  }

  await db.update(users).set({ theme }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}
