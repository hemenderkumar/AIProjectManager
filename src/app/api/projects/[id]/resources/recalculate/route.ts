import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/tenancy";
import { syncAllocationsFromEffort } from "@/lib/allocations";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await syncAllocationsFromEffort(id);
  return NextResponse.json({ ok: true });
}
