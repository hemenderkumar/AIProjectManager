import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { setFieldValue } from "@/lib/customFields";

export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.fieldDefinitionId || !body.entityId) {
    return NextResponse.json({ error: "fieldDefinitionId and entityId are required" }, { status: 400 });
  }
  await setFieldValue(body.fieldDefinitionId, body.entityId, body.value ?? "");
  return NextResponse.json({ ok: true });
}
