import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships, MFA_REQUIRED_ROLES } from "@/lib/keelconnect/access";

// Drives the "set up MFA" banner in the UI: whether the account has MFA enabled, and
// whether any of the user's KeelConnect roles actually require it (Client Finance Approver,
// any Platform role). A user with mfaRequired=true and mfaEnabled=false will get a 403 from
// every route gated by requireScPlatform/requireScOrgRole the moment they try to use that
// role -- this endpoint just lets the UI warn them before that happens.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db.select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, user.id));
  const memberships = await getScMemberships(user.id);
  const mfaRequired = memberships.some((m) => MFA_REQUIRED_ROLES.includes(m.role));

  return NextResponse.json({ mfaEnabled: !!row?.mfaEnabled, mfaRequired });
}
