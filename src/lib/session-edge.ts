import { jwtVerify } from "jose";
import type { SessionUser } from "./auth";

// Edge-runtime-safe copy of just the session-decoding half of lib/auth.ts. Middleware runs
// on the Edge runtime and can't import lib/auth.ts directly -- that file also pulls in
// bcryptjs and the Postgres driver (both Node-only), which would fail to bundle for Edge.
// `jose`'s jwtVerify is Edge-safe (Web Crypto based), so this one function is split out.
// Keep the cookie name and secret handling in sync with lib/auth.ts.

export const SESSION_COOKIE_NAME = "kpi_session";

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set. Add a long random string as AUTH_SECRET in your environment.");
  }
  return new TextEncoder().encode(secret);
}

export async function getSessionUserEdge(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}
