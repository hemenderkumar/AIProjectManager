import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships, hasPlatformRole } from "@/lib/keelconnect/access";

// Lightweight "who am I on KeelConnect" endpoint the client-side pages use to decide which
// buttons/sections to render (e.g. only Platform Compliance Officer/Admin see the "verify"
// controls on a compliance record). This is purely a UI convenience -- every actual write is
// still independently checked server-side by its own route, so a stale or spoofed client
// read of this endpoint can't grant real access.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const memberships = await getScMemberships(user.id);
  return NextResponse.json({ memberships, isPlatform: hasPlatformRole(memberships) });
}
