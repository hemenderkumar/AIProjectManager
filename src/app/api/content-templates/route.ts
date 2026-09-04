import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  listContentTemplates,
  createContentTemplate,
  type ContentTemplateEntity,
  type ContentTemplateKind,
} from "@/lib/contentTemplates";

const ENTITY_TYPES = new Set(["RFP", "SOW", "STATUS_REPORT"]);
const KINDS = new Set(["SKELETON", "STYLE_PRESET"]);

// List (and create) content templates for RFPs, SOWs, and status reports — skeletons
// (reusable starting-point fields) and style presets (named AI instruction snippets), see
// lib/contentTemplates.ts for the full shape. entityType is required so the client only ever
// fetches the templates relevant to whichever form/picker it's rendering; kind narrows further
// (e.g. only STYLE_PRESET for a style picker).
export async function GET(req: NextRequest) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entityType = req.nextUrl.searchParams.get("entityType");
  const kind = req.nextUrl.searchParams.get("kind");
  if (!entityType || !ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "a valid entityType query param is required" }, { status: 400 });
  }
  if (kind && !KINDS.has(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  const data = await listContentTemplates(user, entityType as ContentTemplateEntity, kind as ContentTemplateKind | undefined);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { entityType, kind, name, description, snapshot } = body;
  if (!entityType || !ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "a valid entityType is required" }, { status: 400 });
  }
  if (!kind || !KINDS.has(kind)) {
    return NextResponse.json({ error: "a valid kind is required" }, { status: 400 });
  }
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (entityType === "STATUS_REPORT" && kind === "SKELETON") {
    return NextResponse.json({ error: "status reports don't support saved skeletons, only style presets" }, { status: 400 });
  }
  if (!snapshot || typeof snapshot !== "object") {
    return NextResponse.json({ error: "snapshot is required" }, { status: 400 });
  }

  const created = await createContentTemplate(user, entityType, kind, String(name).trim(), description, snapshot);
  return NextResponse.json(created, { status: 201 });
}
