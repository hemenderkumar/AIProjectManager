"use client";
import { useEffect, useState, use as usePromise } from "react";
import Topbar from "@/components/Topbar";
import { ChevronDown, ChevronRight, Send } from "lucide-react";
import AiEditChat from "@/components/project/AiEditChat";

type Project = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  currency: string;
  targetBudget: number | null;
  engagementModel: "MARKETPLACE" | "MEDIATOR";
  clientOrgId: string;
};
type Organization = { id: string; name: string; orgType: "CLIENT" | "VENDOR" };
type Bid = {
  id: string;
  vendorOrgId: string;
  proposedPrice: number;
  currency: string;
  timeline: string | null;
  status: string;
};
type NegotiationEntry = {
  id: string;
  price: number;
  currency: string;
  terms: string | null;
  proposedByOrgType: "CLIENT" | "VENDOR";
  createdAt: string;
};
type Agreement = { id: string; type: string; status: string };
type Me = { isPlatform: boolean; memberships: { scOrganizationId: string | null; role: string }[] };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function KeelConnectProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = usePromise(params);
  const [project, setProject] = useState<Project | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedBid, setExpandedBid] = useState<string | null>(null);
  const [negotiations, setNegotiations] = useState<Record<string, NegotiationEntry[]>>({});
  const [counterPrice, setCounterPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [bidVendorOrgId, setBidVendorOrgId] = useState("");
  const [bidPrice, setBidPrice] = useState("");
  const [bidTimeline, setBidTimeline] = useState("");

  async function load() {
    setLoading(true);
    const [projectRes, orgsRes, bidsRes, agreementsRes, meRes] = await Promise.all([
      fetch(`/api/keelconnect/projects/${projectId}`),
      fetch("/api/keelconnect/organizations"),
      fetch(`/api/keelconnect/projects/${projectId}/bids`),
      fetch(`/api/keelconnect/projects/${projectId}/agreements`),
      fetch("/api/keelconnect/me"),
    ]);
    if (projectRes.ok) setProject(await projectRes.json());
    if (orgsRes.ok) setOrgs(await orgsRes.json());
    if (bidsRes.ok) setBids(await bidsRes.json());
    if (agreementsRes.ok) setAgreements(await agreementsRes.json());
    if (meRes.ok) setMe(await meRes.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [projectId]);

  async function loadNegotiations(bidId: string) {
    const res = await fetch(`/api/keelconnect/bids/${bidId}/negotiations`);
    if (res.ok) {
      const data = await res.json();
      setNegotiations((n) => ({ ...n, [bidId]: data }));
    }
  }

  function toggleBid(bidId: string) {
    if (expandedBid === bidId) {
      setExpandedBid(null);
      return;
    }
    setExpandedBid(bidId);
    if (!negotiations[bidId]) loadNegotiations(bidId);
  }

  const myOrgIds = me?.memberships.filter((m) => m.scOrganizationId).map((m) => m.scOrganizationId as string) ?? [];
  const isClientOwner = !!project && myOrgIds.includes(project.clientOrgId);
  const isPlatform = !!me?.isPlatform;
  const myVendorOrgs = orgs.filter((o) => o.orgType === "VENDOR" && myOrgIds.includes(o.id));

  async function updateProjectStatus(status: string) {
    setError(null);
    const res = await fetch(`/api/keelconnect/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not update project.");
      return;
    }
    load();
  }

  async function submitBid() {
    if (!bidVendorOrgId || !bidPrice) return;
    setError(null);
    const res = await fetch(`/api/keelconnect/projects/${projectId}/bids`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorOrgId: bidVendorOrgId, proposedPrice: Number(bidPrice), timeline: bidTimeline }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not submit bid.");
      return;
    }
    setBidPrice("");
    setBidTimeline("");
    load();
  }

  async function decideBid(bidId: string, status: "ACCEPTED" | "REJECTED") {
    setError(null);
    const res = await fetch(`/api/keelconnect/bids/${bidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not update bid.");
      return;
    }
    load();
  }

  async function sendCounter(bidId: string) {
    if (!counterPrice) return;
    await fetch(`/api/keelconnect/bids/${bidId}/negotiations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: Number(counterPrice) }),
    });
    setCounterPrice("");
    loadNegotiations(bidId);
    load();
  }

  if (loading) {
    return (
      <div>
        <Topbar title="Project" />
        <div className="p-8 text-sm text-slate-400">Loading...</div>
      </div>
    );
  }
  if (!project) {
    return (
      <div>
        <Topbar title="Project" />
        <div className="p-8 text-sm text-slate-400">Not found, or you don&apos;t have access to it.</div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title={project.title} subtitle={`${project.engagementModel === "MEDIATOR" ? "Mediator" : "Marketplace"} engagement · ${project.status}`} />
      <div className="p-8 max-w-3xl space-y-6">
        {error && <p className="text-xs text-rose-600">{error}</p>}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-2">Overview</p>
          <p className="text-sm text-slate-600 mb-3">{project.description || "No description provided."}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Category</dt><dd className="text-slate-800">{project.category ?? "—"}</dd></div>
            <div><dt className="text-xs text-slate-400">Target budget</dt><dd className="text-slate-800">{project.targetBudget ? `${project.currency} ${project.targetBudget.toLocaleString()}` : "—"}</dd></div>
          </dl>
          {isClientOwner && project.status === "DRAFT" && (
            <button onClick={() => updateProjectStatus("OPEN")} className="mt-4 px-3 py-1.5 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700">
              Post to marketplace
            </button>
          )}
          {(isClientOwner || isPlatform) && ["DRAFT", "OPEN", "NEGOTIATING"].includes(project.status) && (
            <button onClick={() => updateProjectStatus("CANCELLED")} className="mt-4 ml-2 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-medium hover:bg-rose-50">
              Cancel project
            </button>
          )}
          {(isClientOwner || isPlatform) && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <AiEditChat
                entityType="scProject"
                entityId={project.id}
                onApplied={() => load()}
                placeholder='e.g. "raise the budget to 15000 and mention it needs SOC 2 experience"'
              />
            </div>
          )}
        </div>

        {myVendorOrgs.length > 0 && project.status === "OPEN" && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-2.5">
            <p className="text-sm font-semibold text-slate-900">Submit a bid</p>
            <select value={bidVendorOrgId} onChange={(e) => setBidVendorOrgId(e.target.value)} className={inputCls}>
              <option value="">Bidding as...</option>
              {myVendorOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input placeholder="Proposed price" type="number" value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} className={inputCls} />
              <input placeholder="Timeline (e.g. 8 weeks)" value={bidTimeline} onChange={(e) => setBidTimeline(e.target.value)} className={inputCls} />
            </div>
            <button onClick={submitBid} disabled={!bidVendorOrgId || !bidPrice} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700 disabled:opacity-50">
              <Send size={13} /> Submit bid
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">Bids</p>
          <div className="space-y-2">
            {bids.map((b) => (
              <div key={b.id} className="border border-slate-100 rounded-lg">
                <button onClick={() => toggleBid(b.id)} className="w-full flex items-center justify-between p-3 text-left">
                  <div className="flex items-center gap-2">
                    {expandedBid === b.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <div>
                      <p className="text-sm font-medium text-slate-800">{b.currency} {b.proposedPrice.toLocaleString()}</p>
                      <p className="text-xs text-slate-400">{b.timeline ?? "No timeline given"}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-500">{b.status}</span>
                </button>
                {expandedBid === b.id && (
                  <div className="border-t border-slate-100 p-3 space-y-2">
                    {(negotiations[b.id] ?? []).map((n) => (
                      <div key={n.id} className="text-xs text-slate-600 flex justify-between">
                        <span>{n.proposedByOrgType === "CLIENT" ? "Client" : "Vendor"} offered {n.currency} {n.price.toLocaleString()}</span>
                        <span className="text-slate-400">{new Date(n.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                    {(b.status === "SUBMITTED" || b.status === "COUNTERED") && (isClientOwner || myVendorOrgs.some((o) => o.id === b.vendorOrgId)) && (
                      <div className="flex gap-2 pt-1">
                        <input placeholder="Counter price" type="number" value={counterPrice} onChange={(e) => setCounterPrice(e.target.value)} className={inputCls} />
                        <button onClick={() => sendCounter(b.id)} className="shrink-0 px-3 py-1.5 rounded-lg bg-accent-50 text-accent-600 text-xs font-medium hover:bg-accent-100">Counter</button>
                      </div>
                    )}
                    {isClientOwner && (b.status === "SUBMITTED" || b.status === "COUNTERED") && (
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => decideBid(b.id, "ACCEPTED")} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100">Accept</button>
                        <button onClick={() => decideBid(b.id, "REJECTED")} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100">Reject</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {bids.length === 0 && <p className="text-xs text-slate-400 py-4 text-center">No bids yet.</p>}
          </div>
        </div>

        {agreements.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <p className="text-sm font-semibold text-slate-900 mb-3">Agreements</p>
            <div className="space-y-2">
              {agreements.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm border-b border-slate-50 pb-2 last:border-0">
                  <p className="font-medium text-slate-800">{a.type.replace(/_/g, "-")}</p>
                  <span className="text-xs font-medium text-slate-500">{a.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
