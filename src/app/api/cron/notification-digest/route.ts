import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";
import { sendEmail } from "@/lib/email";

// Daily digest (#262): one email per user with at least one unread notification, summarizing
// what's waiting for them (mentions, comments) so someone who doesn't live in the bell icon
// still finds out. Deliberately does NOT mark anything read -- read/unread is only ever
// changed by the user's own action in the UI; the digest is just a nudge, not a side effect.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const unread = await db
    .select({ id: notifications.id, userId: notifications.userId, title: notifications.title, createdAt: notifications.createdAt })
    .from(notifications)
    .where(isNull(notifications.readAt));

  if (!unread.length) return NextResponse.json({ ok: true, usersNotified: 0 });

  const byUser = new Map<string, typeof unread>();
  for (const n of unread) {
    if (!byUser.has(n.userId)) byUser.set(n.userId, []);
    byUser.get(n.userId)!.push(n);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  let usersNotified = 0;
  for (const [userId, items] of byUser) {
    const [user] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, userId));
    if (!user?.email) continue;
    const lines = items.slice(0, 10).map((n) => `- ${n.title}`).join("\n");
    const more = items.length > 10 ? `\n...and ${items.length - 10} more.` : "";
    const ok = await sendEmail(
      user.email,
      `You have ${items.length} unread Keel notification${items.length === 1 ? "" : "s"}`,
      `${lines}${more}\n\nReview them at ${appUrl}.`
    );
    if (ok) usersNotified += 1;
  }

  return NextResponse.json({ ok: true, usersNotified });
}
