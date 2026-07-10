import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { syncAllocationsFromEffort } from "@/lib/allocations";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await syncAllocationsFromEffort(id);
  return NextResponse.json({ ok: true });
}
