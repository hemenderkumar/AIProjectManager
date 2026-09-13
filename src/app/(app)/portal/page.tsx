import Link from "next/link";
import Topbar from "@/components/Topbar";
import KpiCard from "@/components/KpiCard";
import { RagBadge, StageBadge } from "@/components/badges";
import { getCurrentUser } from "@/lib/auth";
import { getClientPortalData } from "@/lib/clientPortal";
import { formatDate } from "@/lib/format";
import { FileCheck2, Receipt, MessageCircleHeart, Flag } from "lucide-react";

export const dynamic = "force-dynamic";

const DELIVERABLE_STATUS_STYLES: Record<string, string> = {
  IN_REVIEW: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  FINAL: "bg-emerald-50 text-emerald-700",
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  OVERDUE: "bg-rose-50 text-rose-700",
  DISPUTED: "bg-amber-50 text-amber-700",
};

// A deliberately narrower, client-friendly rollup than the internal /dashboard -- see the
// comment on getClientPortalData in lib/clientPortal.ts. Reachable by any authenticated user
// (internal staff can view it too, same as they can view /projects), but the content itself
// is naturally scoped to whatever `user` can see: a client SUPER_USER's whole organization, a
// client PM/CONTRIBUTOR/VIEWER's own projects, and full portfolio for internal ADMIN/staff.
export default async function ClientPortalPage() {
  const user = await getCurrentUser();
  const data = await getClientPortalData(user);

  const activeProjects = data.projects.filter((p) => p.stage !== "CLOSED");

  return (
    <div>
      <Topbar title="Client Portal" subtitle="A quick read on how your projects are going" />

      <div className="p-8 space-y-6 max-w-6xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Active Projects" value={data.activeCount} />
          <KpiCard label="On Track" value={data.byRag.GREEN ?? 0} tone="good" />
          <KpiCard label="Needs Attention" value={(data.byRag.YELLOW ?? 0) + (data.byRag.RED ?? 0)} tone={(data.byRag.YELLOW ?? 0) + (data.byRag.RED ?? 0) > 0 ? "warn" : "good"} />
          <KpiCard
            label="Client Satisfaction"
            value={data.satisfaction.avgNps != null ? `${data.satisfaction.avgNps.toFixed(1)} NPS` : "—"}
            hint={data.satisfaction.responseCount ? `${data.satisfaction.responseCount} response${data.satisfaction.responseCount === 1 ? "" : "s"}` : "No responses yet"}
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Your Projects</p>
          </div>
          {activeProjects.length === 0 ? (
            <p className="text-sm text-slate-400 p-4">No active projects yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Project</th>
                    <th className="px-4 py-2 font-medium">Stage</th>
                    <th className="px-4 py-2 font-medium">Health</th>
                    <th className="px-4 py-2 font-medium">% Complete</th>
                    <th className="px-4 py-2 font-medium">Target End</th>
                  </tr>
                </thead>
                <tbody>
                  {activeProjects.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-accent-600">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5"><StageBadge stage={p.stage} /></td>
                      <td className="px-4 py-2.5"><RagBadge rag={p.autoRag} /></td>
                      <td className="px-4 py-2.5 text-slate-600">{p.percentComplete}%</td>
                      <td className="px-4 py-2.5 text-slate-600">{formatDate(p.targetEndDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Flag size={15} className="text-accent-600" />
              <p className="text-sm font-semibold text-slate-900">Upcoming Milestones</p>
            </div>
            <div className="divide-y divide-slate-50">
              {data.upcomingMilestones.length === 0 && (
                <p className="text-sm text-slate-400 p-4">No upcoming milestones.</p>
              )}
              {data.upcomingMilestones.map((m) => (
                <div key={m.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{m.name}</p>
                    <p className="text-xs text-slate-400">{m.projectName}</p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{formatDate(m.dueDate)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <FileCheck2 size={15} className="text-accent-600" />
              <p className="text-sm font-semibold text-slate-900">Deliverables</p>
            </div>
            <div className="divide-y divide-slate-50">
              {data.recentDeliverables.length === 0 && (
                <p className="text-sm text-slate-400 p-4">No deliverables awaiting review yet.</p>
              )}
              {data.recentDeliverables.map((d) => (
                <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{d.title}</p>
                    <p className="text-xs text-slate-400">{d.projectName}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${DELIVERABLE_STATUS_STYLES[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {d.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Receipt size={15} className="text-accent-600" />
              <p className="text-sm font-semibold text-slate-900">Open Invoices</p>
            </div>
            <div className="divide-y divide-slate-50">
              {data.openInvoices.length === 0 && (
                <p className="text-sm text-slate-400 p-4">Nothing outstanding right now.</p>
              )}
              {data.openInvoices.map((inv) => (
                <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{inv.invoiceNumber || inv.vendor}</p>
                    <p className="text-xs text-slate-400">{inv.projectName} · due {formatDate(inv.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-slate-700">${inv.amount.toLocaleString()}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INVOICE_STATUS_STYLES[inv.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircleHeart size={15} className="text-accent-600" />
              <p className="text-sm font-semibold text-slate-900">Satisfaction</p>
            </div>
            {data.satisfaction.responseCount === 0 ? (
              <p className="text-sm text-slate-400">No survey responses yet — your project team can send a quick check-in from any project&apos;s Status tab.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-slate-400">Avg. NPS</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {data.satisfaction.avgNps != null ? `${data.satisfaction.avgNps.toFixed(1)} / 10` : "—"}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-slate-400">Avg. CSAT</p>
                  <p className="text-lg font-semibold text-slate-800">
                    {data.satisfaction.avgCsat != null ? `${data.satisfaction.avgCsat.toFixed(1)} / 5` : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
