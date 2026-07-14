import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, activityEvents } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

// ADMIN-only, platform-wide view of "who's actually using this": per-user login counts +
// last login, aggregate totals, and a recent feed of logins + public-link visits (login
// page, marketing homepage, RFP vendor links). Capped at 200 recent rows — a review tool,
// not a full analytics export.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [userRows, recent, totalsRow] = await Promise.all([
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
    db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(200),
    db
      .select({
        totalLogins: sql<number>`count(*) filter (where ${activityEvents.type} = 'LOGIN')`,
        totalPublicVisits: sql<number>`count(*) filter (where ${activityEvents.type} = 'PUBLIC_VISIT')`,
      })
      .from(activityEvents),
  ]);

  const usersWhoLoggedIn = userRows.filter((u) => (u.loginCount ?? 0) > 0).length;

  return NextResponse.json({
    users: userRows,
    recent,
    totals: {
      totalLogins: Number(totalsRow[0]?.totalLogins ?? 0),
      totalPublicVisits: Number(totalsRow[0]?.totalPublicVisits ?? 0),
      usersWhoLoggedIn,
      totalUsers: userRows.length,
    },
  });
}
