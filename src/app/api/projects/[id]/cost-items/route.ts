import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { costItems } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

const CATEGORIES = ["MATERIAL", "IMPLEMENTATION", "ONGOING_SUPPORT"] as const;
type Category = (typeof CATEGORIES)[number];

function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

// Backs the Charter's Cost Summary breakdown: each of Material / Implementation / Ongoing
// support is now a list of named line items (not a single typed-in number) so the top-line
// $ figure is always the sum of something a reader can see, not an opaque guess.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("VIEWER", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.select().from(costItems).where(eq(costItems.projectId, id));
  return NextResponse.json(rows);
}

// Two shapes handled here:
//  - single-item create: { category, name, amount, cadence?, notes?, isRecurring? }
//  - bulk replace (used by "Estimate with AI"): { category, items: [{name, amount, notes?}],
//    replace: true } -- atomically swaps out every existing row in that category for the
//    freshly generated set, rather than appending to whatever was there before.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));

  if (!isCategory(body.category)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
  }

  if (body.replace && Array.isArray(body.items)) {
    const items = body.items as { name?: string; amount?: number; cadence?: string; notes?: string }[];
    await db.delete(costItems).where(and(eq(costItems.projectId, id), eq(costItems.category, body.category)));
    const values = items
      .filter((it) => it.name && String(it.name).trim())
      .map((it) => ({
        projectId: id,
        category: body.category as Category,
        name: String(it.name).trim(),
        amount: typeof it.amount === "number" && !Number.isNaN(it.amount) ? it.amount : 0,
        isRecurring: body.category === "ONGOING_SUPPORT",
        cadence: body.category === "ONGOING_SUPPORT" ? "monthly" : "one-time",
        notes: it.notes || null,
        createdByAi: true,
      }));
    const created = values.length ? await db.insert(costItems).values(values).returning() : [];
    return NextResponse.json(created, { status: 201 });
  }

  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(costItems)
    .values({
      projectId: id,
      category: body.category as Category,
      name: String(body.name).trim(),
      amount: typeof body.amount === "number" && !Number.isNaN(body.amount) ? body.amount : Number(body.amount) || 0,
      isRecurring: body.category === "ONGOING_SUPPORT",
      cadence: body.category === "ONGOING_SUPPORT" ? "monthly" : "one-time",
      notes: body.notes || null,
      createdByAi: false,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
