import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireRole, hashPassword } from "@/lib/auth";

export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const all = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    resourceId: users.resourceId,
    createdAt: users.createdAt,
  }).from(users);
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !body.email || !body.password) {
    return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
  }
  const passwordHash = await hashPassword(body.password);
  const [created] = await db
    .insert(users)
    .values({
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash,
      role: body.role ?? "VIEWER",
      resourceId: body.resourceId ?? null,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  return NextResponse.json(created, { status: 201 });
}
