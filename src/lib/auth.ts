import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "PM" | "CONTRIBUTOR" | "VIEWER";
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
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  if (process.env.DISABLE_AUTH === "true") {
    return BYPASS_USER;
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

export function roleAtLeast(role: SessionUser["role"], min: SessionUser["role"]) {
  const order = { VIEWER: 0, CONTRIBUTOR: 1, PM: 2, ADMIN: 3 };
  return order[role] >= order[min];
}

export async function requireRole(min: SessionUser["role"]) {
  const user = await getCurrentUser();
  if (!user || !roleAtLeast(user.role, min)) return null;
  return user;
}
