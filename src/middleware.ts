import { NextRequest, NextResponse } from "next/server";
import type { NextFetchEvent } from "next/server";
import { getSessionUserEdge, SESSION_COOKIE_NAME } from "@/lib/session-edge";
import { labelForApiMutation } from "@/lib/activityLabels";

// Builds the "what did this user do" activity trail two ways, for every logged-in
// request that reaches here:
//  1. Page views -- any GET to a non-API app page becomes a PAGE_VIEW row (path only).
//     Skips Next.js's own background prefetch requests (Next-Router-Prefetch header) so
//     hovering a link doesn't get logged as if the page were actually opened.
//  2. Actions -- any mutating request (POST/PATCH/PUT/DELETE) to /api/** gets turned into
//     a short label via labelForApiMutation ("Created a task", "Updated a risk", ...) and
//     logged as an ACTION row. Entities that already have their own rich logAudit() calls
//     (SOWs, Deliverables, RFPs, rate cards, org/admin management, Plan-sequence gates) are
//     excluded there to avoid double-logging the same request under two different labels.
// Actually writing the row needs Postgres, which isn't available on the Edge runtime this
// file runs on -- so this only decodes the session (Edge-safe, via jose) and fires a
// background request to /api/activity/log (a normal Node function) via waitUntil(), never
// blocking the real response.
export async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  if (request.headers.get("next-router-prefetch")) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = await getSessionUserEdge(token);
  if (!user) return NextResponse.next();

  let payload: { type: "PAGE_VIEW" | "ACTION"; path: string; detail?: string; userId: string; userName: string } | null = null;

  if (!pathname.startsWith("/api/")) {
    if (method === "GET") {
      payload = { type: "PAGE_VIEW", path: pathname, userId: user.id, userName: user.name };
    }
  } else if (method !== "GET") {
    const detail = labelForApiMutation(method, pathname);
    if (detail) {
      payload = { type: "ACTION", path: pathname, detail, userId: user.id, userName: user.name };
    }
  }

  if (payload) {
    const logUrl = new URL("/api/activity/log", request.url);
    event.waitUntil(
      fetch(logUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {})
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|json|woff2?|ttf|txt|xml)$).*)",
  ],
};
