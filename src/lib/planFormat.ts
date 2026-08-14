// Pure, dependency-free formatting for a billing plan's price -- shared between the
// client-side /billing page and the public marketing homepage's pricing section, neither of
// which should pull in lib/billing.ts (server-only: Stripe SDK + db).
export type PlanForDisplay = {
  priceCents: number | null;
  billingInterval: string;
  billingModel: string;
};

export function formatPlanPrice(p: PlanForDisplay): string {
  if (p.priceCents == null) return "Contact us";
  const dollars = (p.priceCents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const unit = p.billingModel === "per_seat" ? "user/" : "";
  return `$${dollars}/${unit}${p.billingInterval}`;
}
