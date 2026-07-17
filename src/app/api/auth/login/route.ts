import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, registrationRequests } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { verifyPassword, createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (!user) {
    // Give a clearer answer than "invalid credentials" for someone who registered but is
    // still waiting on admin approval — a generic error here reads as a typo/wrong password,
    // and they'd have no way to know their request is just sitting in the queue.
    const [pending] = await db
      .select({ status: registrationRequests.status })
      .from(registrationRequests)
      .where(eq(registrationRequests.email, email.toLowerCase()));
    if (pending?.status === "PENDING") {
      return NextResponse.json({ error: "Your registration is still awaiting admin approval." }, { status: 403 });
    }
    if (pending?.status === "REJECTED") {
      return NextResponse.json({ error: "Your registration request was not approved. Contact your admin if you think this is a mistake." }, { status: 403 });
    }
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSessionToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
  });

  // Best-effort — never block a successful login on this.
  await db
    .update(users)
    .set({ lastLoginAt: new Date(), loginCount: sql`${users.loginCount} + 1` })
    .where(eq(users.id, user.id))
    .catch(() => {});
  await logActivity({ type: "LOGIN", userId: user.id, userName: user.name, path: "/login" });

  const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
