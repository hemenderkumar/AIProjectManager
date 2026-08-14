import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { isOrgBillingBlocked } from "@/lib/billing";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Computed here (Node runtime, has DB access) rather than in middleware.ts (Edge runtime,
  // no Postgres) -- see the comment there. AppShell is a client component with usePathname,
  // so it's the one that actually decides whether to show the paywall vs. real content,
  // letting /billing itself stay reachable even while blocked.
  const billingBlocked = await isOrgBillingBlocked(user.organizationId);

  return (
    <AppShell user={user} billingBlocked={billingBlocked}>
      {children}
    </AppShell>
  );
}
