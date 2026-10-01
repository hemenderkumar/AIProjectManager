import Topbar from "@/components/Topbar";
import PortfolioBoard from "@/components/PortfolioBoard";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Portfolio Board decision log -- which initiatives are funded, deferred, held, or killed,
// by whom and why, across the whole visible portfolio. Same no-extra-access-gate pattern as
// /pmo-scorecard: the panel's own API routes enforce PM+ (view) / SUPER_USER+ (decide), this
// page just provides the shell and tells the panel whether to show decision controls.
export default async function PortfolioBoardPage() {
  const user = await getCurrentUser();
  const canDecide = user?.role === "SUPER_USER" || user?.role === "ADMIN";
  return (
    <div>
      <Topbar title="Portfolio Board" subtitle="Which initiatives are funded, deferred, held, or killed across the portfolio — and why" />
      <div className="p-8 space-y-6">
        <PortfolioBoard canDecide={canDecide} />
      </div>
    </div>
  );
}
