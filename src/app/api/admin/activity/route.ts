import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, activityEvents, auditLog } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

// ADMIN-only, platform-wide view of "who's actually using this": per-user login counts +
// last login, aggregate totals, and a recent feed of activity. With no ?userId, the feed
// is the global top 200 rows across every type (logins, public-link visits, in-app page
// views, and generic create/edit/delete actions — see middleware.ts for how the latter two
// get recorded). With ?userId=<id>, it instead returns that one person's full trail (up to
// 500 rows) plus their entries from the separate, richer auditLog table (sensitive actions
// like approvals and deletions), interleaved by time — a review tool, not a full analytics
// export.
export async function GET(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const userId = req.nextUrl.searchParams.get("userId");

  const [userRows, recent, totalsRow, auditRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        organizationId: users.organizationId,
        lastLoginAt: users.lastLoginAt,
        loginCount: users.loginCount,
      })
      .from(users)
      .orderBy(desc(users.lastLoginAt)),
    userId
      ? db.select().from(activityEvents).where(eq(activityEvents.userId, userId)).orderBy(desc(activityEvents.createdAt)).limit(500)
      : db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(200),
    db
      .select({
        totalLogins: sql<number>`count(*) filter (where ${activityEvents.type} = 'LOGIN')`,
        totalPublicVisits: sql<number>`count(*) filter (where ${activityEvents.type} = 'PUBLIC_VISIT')`,
        totalPageViews: sql<number>`count(*) filter (where ${activityEvents.type} = 'PAGE_VIEW')`,
        totalActions: sql<number>`count(*) filter (where ${activityEvents.type} = 'ACTION')`,
      })
      .from(activityEvents),
    userId
      ? db.select().from(auditLog).where(eq(auditLog.actorUserId, userId)).orderBy(desc(auditLog.createdAt)).limit(500)
      : Promise.resolve([]),
  ]);

  const usersWhoLoggedIn = userRows.filter((u) => (u.loginCount ?? 0) > 0).length;

  return NextResponse.json({
    users: userRows,
    recent,
    auditEntries: auditRows,
    totals: {
      totalLogins: Number(totalsRow[0]?.totalLogins ?? 0),
      totalPublicVisits: Number(totalsRow[0]?.totalPublicVisits ?? 0),
      totalPageViews: Number(totalsRow[0]?.totalPageViews ?? 0),
      totalActions: Number(totalsRow[0]?.totalActions ?? 0),
      usersWhoLoggedIn,
      totalUsers: userRows.length,
    },
  });
}
