import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifyApiKey, extractBearerToken } from "@/lib/apiKeys";

async function authOrNull(req: NextRequest, projectId: string) {
  const rawKey = extractBearerToken(req.headers.get("authorization"));
  if (!rawKey) return null;
  const auth = await verifyApiKey(rawKey);
  if (!auth) return null;
  if (!auth.organizationId) return auth; // internal key -- unrestricted, mirrors ADMIN
  const [project] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  if (project.organizationId && project.organizationId !== auth.organizationId) return null;
  return auth;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authOrNull(req, id);
  if (!auth) return NextResponse.json({ error: "Invalid API key or project not accessible to this key" }, { status: 401 });
  const data = await db.select().from(tasks).where(eq(tasks.projectId, id));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authOrNull(req, id);
  if (!auth) return NextResponse.json({ error: "Invalid API key or project not accessible to this key" }, { status: 401 });
  if (!auth.scopes.includes("write")) {
    return NextResponse.json({ error: "This API key doesn't have write access" }, { status: 403 });
  }
  const body = await req.json();
  if (!body.title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  const [created] = await db
    .insert(tasks)
    .values({ projectId: id, title: body.title, description: body.description ?? null })
    .returning();
  return NextResponse.json({ data: created }, { status: 201 });
}
