import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

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

// Session lifetime, in seconds. Used for both the JWT's own expiration and the cookie's
// maxAge, so they can never drift out of sync -- the cookie must never outlive the token it
// carries. Once this elapses, jwtVerify() below starts rejecting the token, getCurrentUser()
// returns null, and the (app) layout's existing guard redirects back to /login -- so "force
// re-login after a while" falls out of shortening this one value, no separate enforcement
// needed.
export const SESSION_MAX_AGE_SECONDS = 60 * 60; // 1 hour

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
  // Pass an absolute Unix timestamp (seconds) rather than a relative string like "1h" --
  // unambiguous either way, and keeps this in lockstep with SESSION_MAX_AGE_SECONDS above.
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
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

// Gates downloads/exports specifically — NOT login, NOT the rest of the app. An
// auto-provisioned INDIVIDUAL self-registration (see /api/auth/register) can use Keel right
// away, but every document export (Word/PDF/PowerPoint, single or batch) stays blocked until
// an admin has reviewed the account (Admin > Pending Registrations > Confirm) — and, in the
// future, once billing is set up, this is also where a payment check would plug in. A live DB
// read (not a claim baked into the session JWT at login) so approving someone unblocks them
// immediately, without needing to log out and back in. Every other account-creation path
// (admin-created users, company-owner approval, the seed admin) is verified from creation —
// see the column comment on users.verifiedAt in schema.ts.
export async function isDownloadBlocked(userId: string): Promise<boolean> {
  const [row] = await db.select({ verifiedAt: users.verifiedAt }).from(users).where(eq(users.id, userId));
  return !row?.verifiedAt;
}

// Keep in sync with the THEMES list in components/ThemeSwitcher.tsx.
export const VALID_THEMES = ["indigo", "nautical", "ocean", "chart", "compass", "coral"] as const;
export type ThemeId = (typeof VALID_THEMES)[number];

// Saved per-account (users.theme), not the browser — so it follows a person to any device or
// browser they log into. Called from the root layout on every request so <html data-theme>
// is correct in the very first byte of HTML sent, with nothing for client JS to correct after
// the fact. Logged-out visitors (or a session that's expired) just get the CSS default (indigo).
export async function getCurrentTheme(): Promise<ThemeId> {
  const user = await getCurrentUser();
  if (!user) return "indigo";
  try {
    // This runs in the root layout on every single authenticated page load, before anything
    // else renders. It's purely cosmetic, so a transient DB hiccup here (e.g. the connection
    // pool being briefly exhausted) must never take down the entire app -- fall back to the
    // default rather than let it bubble into an unhandled render-time crash.
    const [row] = await db.select({ theme: users.theme }).from(users).where(eq(users.id, user.id));
    return (row?.theme as ThemeId) ?? "indigo";
  } catch {
    return "indigo";
  }
}
