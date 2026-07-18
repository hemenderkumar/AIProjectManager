import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueReports } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { getCurrentUser, requireRole } from "@/lib/auth";

// A data URL much past this is almost certainly a huge/high-res capture rather than a
// normal viewport screenshot — Vercel's serverless functions also cap request bodies
// around 4.5MB, so a report this large would 413 before it ever reached us. Rather than
// fail the whole report over an oversized image, drop the screenshot and keep the text.
const MAX_SCREENSHOT_CHARS = 3_500_000;

// Any logged-in user can file an issue/feedback report from anywhere in the app — the
// floating "Report an issue" widget auto-attaches a client-side screenshot (html2canvas)
// of the page they were on. No role requirement here on purpose: a CONTRIBUTOR or VIEWER
// hitting a bug is exactly who should be able to report it.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) return NextResponse.json({ error: "A description is required." }, { status: 400 });

  const pagePath = typeof body?.pagePath === "string" && body.pagePath ? body.pagePath : "unknown";
  let screenshotDataUrl: string | null = typeof body?.screenshotDataUrl === "string" ? body.screenshotDataUrl : null;
  if (screenshotDataUrl && screenshotDataUrl.length > MAX_SCREENSHOT_CHARS) {
    screenshotDataUrl = null;
  }

  const [created] = await db
    .insert(issueReports)
    .values({
      reporterId: user.id,
      reporterName: user.name,
      reporterEmail: user.email,
      organizationId: user.organizationId,
      pagePath,
      description: description.slice(0, 4000),
      screenshotDataUrl,
    })
    .returning({ id: issueReports.id });

  return NextResponse.json({ ok: true, id: created?.id }, { status: 201 });
}

// ADMIN-only event log of everything reported — most recent first. Capped at 200, same
// review-tool convention as the audit log and activity feed rather than a full export.
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(issueReports).orderBy(desc(issueReports.createdAt)).limit(200);
  return NextResponse.json(rows);
}
