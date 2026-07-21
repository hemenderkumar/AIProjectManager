import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scAgreements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canAccessScProject } from "@/lib/keelconnect/access";

// Convenience listing for a project's detail page -- the Agreement(s) generated when its
// winning bid was accepted (one for MARKETPLACE, two for MEDIATOR). Visibility follows the
// project's own access rule; a vendor who lost the bidding never had access to begin with,
// so this can't leak the awarded agreement to them.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessScProject(user, projectId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await db.select().from(scAgreements).where(eq(scAgreements.scProjectId, projectId)));
}
