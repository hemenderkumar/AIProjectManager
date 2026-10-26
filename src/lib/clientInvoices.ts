// Pure helpers for client receivables (the `client_invoices` table) -- no DB or Stripe imports
// so they can be unit-tested directly.

export type ClientInvoiceStatus = "DRAFT" | "SENT" | "PAID" | "VOID";
export type DisplayStatus = ClientInvoiceStatus | "OVERDUE";

// OVERDUE is derived, never stored: a SENT invoice past its due date.
export function displayStatus(inv: { status: ClientInvoiceStatus; dueDate: Date | string | null }, now = new Date()): DisplayStatus {
  if (inv.status !== "SENT" || !inv.dueDate) return inv.status;
  const due = typeof inv.dueDate === "string" ? new Date(inv.dueDate) : inv.dueDate;
  return due.getTime() < now.getTime() ? "OVERDUE" : "SENT";
}

// Next "INV-0001"-style number given the numbers already used by the organization.
export function nextInvoiceNumber(existing: string[]): string {
  let max = 0;
  for (const n of existing) {
    const m = /^INV-(\d+)$/.exec(n.trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `INV-${String(max + 1).padStart(4, "0")}`;
}

// Optional platform fee (STRIPE_CONNECT_FEE_BPS, default 0 = Executa takes nothing). Floors so
// the connected account never loses a fraction of a cent to rounding up.
export function computeApplicationFee(amountCents: number, bps: number): number {
  if (!Number.isFinite(bps) || bps <= 0) return 0;
  return Math.floor((amountCents * bps) / 10000);
}

export function parseAmountToCents(input: unknown): number | null {
  const n = typeof input === "number" ? input : typeof input === "string" ? Number(input.replace(/[$,\s]/g, "")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  // Stripe's practical per-charge ceiling for most accounts; also guards int overflow in the column.
  if (cents < 50 || cents > 99_999_999) return null;
  return cents;
}

export type InvoiceInputResult =
  | { ok: true; amountCents: number; description: string | null; dueDate: Date | null }
  | { ok: false; error: string };

export function validateInvoiceInput(input: { amount?: unknown; description?: unknown; dueDate?: unknown }): InvoiceInputResult {
  const amountCents = parseAmountToCents(input.amount);
  if (amountCents == null) return { ok: false, error: "Enter an amount between $0.50 and $999,999.99" };
  let description: string | null = null;
  if (input.description != null && input.description !== "") {
    if (typeof input.description !== "string" || input.description.length > 500) {
      return { ok: false, error: "Description must be 500 characters or fewer" };
    }
    description = input.description.trim() || null;
  }
  let dueDate: Date | null = null;
  if (input.dueDate != null && input.dueDate !== "") {
    const d = new Date(String(input.dueDate));
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Due date is not a valid date" };
    dueDate = d;
  }
  return { ok: true, amountCents, description, dueDate };
}

// Allowed manual transitions. PAID is only ever set by the verified Stripe webhook.
export function canTransition(from: ClientInvoiceStatus, to: ClientInvoiceStatus): boolean {
  if (from === "DRAFT") return to === "SENT" || to === "VOID";
  if (from === "SENT") return to === "VOID";
  return false;
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}
