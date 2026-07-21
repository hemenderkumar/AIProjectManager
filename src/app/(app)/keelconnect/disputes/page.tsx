"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { Gavel } from "lucide-react";

type Dispute = {
  id: string;
  scProjectId: string | null;
  scAgreementId: string | null;
  description: string;
  status: string;
  resolutionNotes: string | null;
  createdAt: string;
};
type Me = { isPlatform: boolean };

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-amber-50 text-amber-700",
  UNDER_REVIEW: "bg-blue-50 text-blue-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
};

export default function KeelConnectDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [disputesRes, meRes] = await Promise.all([fetch("/api/keelconnect/disputes"), fetch("/api/keelconnect/me")]);
    if (disputesRes.ok) setDisputes(await disputesRes.json());
    if (meRes.ok) setMe(await meRes.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function updateStatus(disputeId: string, status: string) {
    await fetch(`/api/keelconnect/disputes/${disputeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div>
      <Topbar title="Disputes" subtitle="Raised on a project or agreement, mediated by Keel's platform team" />
      <div className="p-8 max-w-3xl space-y-4">
        {loading ? (
          <p className="text-xs text-slate-400">Loading...</p>
        ) : disputes.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 text-center text-xs text-slate-400">
            No disputes. Raise one from a project or agreement page if something needs mediation.
          </div>
        ) : (
          disputes.map((d) => (
            <div key={d.id} className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Gavel size={15} className="text-slate-400" />
                  <p className="text-sm font-medium text-slate-800">{d.description}</p>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[d.status] ?? "bg-slate-100 text-slate-600"}`}>
                  {d.status.replace(/_/g, " ")}
                </span>
              </div>
              {d.resolutionNotes && <p className="text-xs text-slate-500 mb-2">Resolution: {d.resolutionNotes}</p>}
              {me?.isPlatform && d.status !== "RESOLVED" && (
                <div className="flex gap-2">
                  {d.status === "OPEN" && (
                    <button onClick={() => updateStatus(d.id, "UNDER_REVIEW")} className="text-xs px-2.5 py-1.5 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100">
                      Start review
                    </button>
                  )}
                  <button onClick={() => updateStatus(d.id, "RESOLVED")} className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                    Mark resolved
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
