import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SUPER_USER" | "PM" | "CONTRIBUTOR" | "VIEWER";
  // Which company this user belongs to, if any. Null = internal staff (your own team),
  // not tied to a single client. Drives project visibility — see src/lib/tenancy.ts.
  organizationId: string | null;
};

const COOKIE_NAME = "kpi_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Add a long random string as AUTH_SECRET in your environment."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

const BYPASS_USER: SessionUser = {
  id: "bypass-admin",
  name: "Admin (auth disabled)",
  email: "bypass@local",
  role: "ADMIN",
  organizationId: null,
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  // DISABLE_AUTH is a local-dev-only convenience (skip logging in while iterating). It must
  // never take effect once deployed -- VERCEL_ENV is only set by Vercel's build/runtime, so
  // its presence means this is running on Vercel (preview or production), not a developer's
  // own machine. Without this guard, accidentally leaving DISABLE_AUTH=true set in a Vercel
  // project's environment variables (as happened here) disables real login for every visitor,
  // treating them all as a fake "bypass-admin" user that doesn't exist in the users table --
  // which also 500s anywhere the app writes that id as a foreign key (project membership,
  // audit log, etc).
  if (process.env.DISABLE_AUTH === "true" && !process.env.VERCEL_ENV) {
    return BYPASS_USER;
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

// Permission tier (independent of visibility scope — see src/lib/tenancy.ts for who can
// see which projects). SUPER_USER sits below ADMIN: they can act like a PM/approver across
// their own company's projects, but never touch platform-wide/internal-only tools.
export function roleAtLeast(role: SessionUser["role"], min: SessionUser["role"]) {
  const order = { VIEWER: 0, CONTRIBUTOR: 1, PM: 2, SUPER_USER: 3, ADMIN: 4 };
  return order[role] >= order[min];
}

export async function requireRole(min: SessionUser["role"]) {
  const user = await getCurrentUser();
  if (!user || !roleAtLeast(user.role, min)) return null;
  return user;
}
