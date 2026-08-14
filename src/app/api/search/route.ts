import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { globalSearch } from "@/lib/search";

export async function GET(req: NextRequest) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await globalSearch(user, q);
  return NextResponse.json({ results });
}
