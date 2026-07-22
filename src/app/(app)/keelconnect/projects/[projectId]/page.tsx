"use client";
import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
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
  requestType?: "PROJECT" | "RESOURCE_REQUEST";
  skillsRequired?: string[] | null;
  durationWeeks?: number | null;
  rateType?: string | null;
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
type AgreementParty = { partyRole: "CLIENT" | "VENDOR" | "PLATFORM"; scOrganizationId: string | null };
type Agreement = { id: string; type: string; status: string; parties: AgreementParty[] };
type Milestone = {
  id: string;
  scAgreementId: string;
  description: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  status: string;
};
type Payment = { id: string; scMilestoneId: string; amount: number; currency: string; direction: string; status: string };
type ChangeRequest = {
  id: string;
  scAgreementId: string;
  proposedByOrgId: string | null;
  changes: string;
  note: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
};
type Review = { id: string; fromOrgType: "CLIENT" | "VENDOR"; rating: number; comments: string | null };
type SourceTask = { taskId: string; taskTitle: string; deliverProjectId: string; deliverProjectName: string };
type Me = { isPlatform: boolean; memberships: { scOrganizationId: string | null; role: string }[] };

// The underlying status value is still "SIGNED" (see scAgreementStatusEnum / VALID_TRANSITIONS
// in api/keelconnect/agreements/[agreementId]/route.ts) -- only the label changes here. There's
// no document-upload/e-sign step: moving an agreement to SIGNED just means this org's Org
// Admin is attesting agreement to the terms on behalf of their legal entity.
const AGREEMENT_NEXT_STATUS: Record<string, string> = { DRAFT: "SENT", SENT: "SIGNED", SIGNED: "ACTIVE" };
const AGREEMENT_ACTION_LABEL: Record<string, string> = {
  SENT: "Send to other party",
  SIGNED: "Attest & agree (as this org)",
  ACTIVE: "Activate",
};

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

  const [expandedAgreement, setExpandedAgreement] = useState<string | null>(null);
  const [milestonesByAgreement, setMilestonesByAgreement] = useState<Record<string, Milestone[]>>({});
  const [paymentsByMilestone, setPaymentsByMilestone] = useState<Record<string, Payment[]>>({});
  const [changeRequestsByAgreement, setChangeRequestsByAgreement] = useState<Record<string, ChangeRequest[]>>({});
  const [newMilestone, setNewMilestone] = useState({ description: "", amount: "", currency: "USD", dueDate: "" });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewRating, setReviewRating] = useState("5");
  const [reviewComments, setReviewComments] = useState("");
  const [sourceTask, setSourceTask] = useState<SourceTask | null>(null);

  async function load() {
    setLoading(true);
    const [projectRes, orgsRes, bidsRes, agreementsRes, meRes, reviewsRes, sourceTaskRes] = await Promise.all([
      fetch(`/api/keelconnect/projects/${projectId}`),
      fetch("/api/keelconnect/organizations"),
      fetch(`/api/keelconnect/projects/${projectId}/bids`),
      fetch(`/api/keelconnect/projects/${projectId}/agreements`),
      fetch("/api/keelconnect/me"),
      fetch(`/api/keelconnect/projects/${projectId}/reviews`),
      fetch(`/api/keelconnect/projects/${projectId}/source-task`),
    ]);
    if (projectRes.ok) setProject(await projectRes.json());
    if (orgsRes.ok) setOrgs(await orgsRes.json());
    if (bidsRes.ok) setBids(await bidsRes.json());
    if (agreementsRes.ok) setAgreements(await agreementsRes.json());
    if (meRes.ok) setMe(await meRes.json());
    if (reviewsRes.ok) setReviews(await reviewsRes.json());
    if (sourceTaskRes.ok) setSourceTask(await sourceTaskRes.json());
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

  const awardedBid = bids.find((b) => b.status === "ACCEPTED");
  const isAwardedVendor = !!awardedBid && myVendorOrgs.some((o) => o.id === awardedBid.vendorOrgId);
  const myReviewFromOrgType: "CLIENT" | "VENDOR" | null = isClientOwner ? "CLIENT" : isAwardedVendor ? "VENDOR" : null;

  function rolesInOrg(orgId: string | null): string[] {
    if (!orgId) return [];
    return (me?.memberships ?? []).filter((m) => m.scOrganizationId === orgId).map((m) => m.role);
  }
  function agreementOrgIds(a: Agreement) {
    return {
      clientOrgId: a.parties.find((p) => p.partyRole === "CLIENT")?.scOrganizationId ?? null,
      vendorOrgId: a.parties.find((p) => p.partyRole === "VENDOR")?.scOrganizationId ?? null,
    };
  }
  function canManageAgreement(a: Agreement): boolean {
    if (isPlatform) return true;
    const { clientOrgId, vendorOrgId } = agreementOrgIds(a);
    return rolesInOrg(clientOrgId).includes("CLIENT_ORG_ADMIN") || rolesInOrg(vendorOrgId).includes("VENDOR_ORG_ADMIN");
  }
  function canManageFinance(a: Agreement): boolean {
    if (isPlatform) return true;
    const { clientOrgId } = agreementOrgIds(a);
    return rolesInOrg(clientOrgId).some((r) => r === "CLIENT_FINANCE_APPROVER" || r === "CLIENT_ORG_ADMIN");
  }

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

  async function loadMilestones(agreementId: string) {
    const res = await fetch(`/api/keelconnect/agreements/${agreementId}/milestones`);
    if (!res.ok) return;
    const data: Milestone[] = await res.json();
    setMilestonesByAgreement((m) => ({ ...m, [agreementId]: data }));
    await Promise.all(data.map((ms) => loadPayments(ms.id)));
  }

  async function loadPayments(milestoneId: string) {
    const res = await fetch(`/api/keelconnect/milestones/${milestoneId}/payments`);
    if (res.ok) {
      const data = await res.json();
      setPaymentsByMilestone((p) => ({ ...p, [milestoneId]: data }));
    }
  }

  async function loadChangeRequests(agreementId: string) {
    const res = await fetch(`/api/keelconnect/agreements/${agreementId}/change-requests`);
    if (res.ok) {
      const data = await res.json();
      setChangeRequestsByAgreement((c) => ({ ...c, [agreementId]: data }));
    }
  }

  function toggleAgreement(agreementId: string) {
    if (expandedAgreement === agreementId) {
      setExpandedAgreement(null);
      return;
    }
    setExpandedAgreement(agreementId);
    if (!milestonesByAgreement[agreementId]) loadMilestones(agreementId);
    if (!changeRequestsByAgreement[agreementId]) loadChangeRequests(agreementId);
  }

  async function decideChangeRequest(changeRequestId: string, agreementId: string, status: "ACCEPTED" | "REJECTED") {
    setError(null);
    const res = await fetch(`/api/keelconnect/change-requests/${changeRequestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not decide on this change request.");
      return;
    }
    loadChangeRequests(agreementId);
    load();
  }

  async function updateAgreementStatus(agreementId: string, status: string) {
    setError(null);
    const res = await fetch(`/api/keelconnect/agreements/${agreementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not update agreement.");
      return;
    }
    load();
  }

  async function addMilestone(agreementId: string) {
    if (!newMilestone.description.trim() || !newMilestone.amount) return;
    setError(null);
    const res = await fetch(`/api/keelconnect/agreements/${agreementId}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: newMilestone.description,
        amount: Number(newMilestone.amount),
        currency: newMilestone.currency,
        dueDate: newMilestone.dueDate || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not create milestone.");
      return;
    }
    setNewMilestone({ description: "", amount: "", currency: "USD", dueDate: "" });
    loadMilestones(agreementId);
  }

  async function approveMilestone(milestone: Milestone) {
    setError(null);
    const res = await fetch(`/api/keelconnect/milestones/${milestone.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "APPROVED" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not approve milestone.");
      return;
    }
    loadMilestones(milestone.scAgreementId);
  }

  async function raisePayment(milestone: Milestone, direction: string) {
    setError(null);
    const res = await fetch(`/api/keelconnect/milestones/${milestone.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not raise payment.");
      return;
    }
    loadPayments(milestone.id);
  }

  async function payWithStripe(payment: Payment) {
    setError(null);
    const res = await fetch(`/api/keelconnect/payments/${payment.id}/checkout`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data?.error ?? "Could not start payment.");
      return;
    }
    // Identical redirect pattern is clean elsewhere (e.g. organizations/[orgId]'s
    // connectStripe) -- false positive from the experimental react-hooks/immutability rule.
    // eslint-disable-next-line react-hooks/immutability
    window.location.href = data.url;
  }

  async function updatePaymentStatus(payment: Payment, status: string) {
    setError(null);
    const res = await fetch(`/api/keelconnect/payments/${payment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not update payment.");
      return;
    }
    loadPayments(payment.scMilestoneId);
    if (status === "RELEASED") {
      const milestone = Object.values(milestonesByAgreement).flat().find((m) => m.id === payment.scMilestoneId);
      if (milestone) loadMilestones(milestone.scAgreementId);
    }
  }

  async function submitReview() {
    setError(null);
    const res = await fetch(`/api/keelconnect/projects/${projectId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: Number(reviewRating), comments: reviewComments || undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not submit review.");
      return;
    }
    setReviewComments("");
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

  const isResourceRequest = project.requestType === "RESOURCE_REQUEST";

  return (
    <div>
      <Topbar
        title={project.title}
        subtitle={`${isResourceRequest ? "Resource request" : `${project.engagementModel === "MEDIATOR" ? "Mediator" : "Marketplace"} engagement`} · ${project.status}`}
      />
      <div className="p-8 max-w-3xl space-y-6">
        {error && <p className="text-xs text-rose-600">{error}</p>}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-2">Overview</p>
          <p className="text-sm text-slate-600 mb-3">{project.description || "No description provided."}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-slate-400">Category</dt><dd className="text-slate-800">{project.category ?? "—"}</dd></div>
            <div>
              <dt className="text-xs text-slate-400">{isResourceRequest ? "Target rate" : "Target budget"}</dt>
              <dd className="text-slate-800">
                {project.targetBudget
                  ? `${project.currency} ${project.targetBudget.toLocaleString()}${isResourceRequest && project.rateType ? `/${project.rateType.toLowerCase()}` : ""}`
                  : "—"}
              </dd>
            </div>
            {isResourceRequest && (
              <>
                <div><dt className="text-xs text-slate-400">Skills required</dt><dd className="text-slate-800">{project.skillsRequired?.length ? project.skillsRequired.join(", ") : "—"}</dd></div>
                <div><dt className="text-xs text-slate-400">Duration</dt><dd className="text-slate-800">{project.durationWeeks ? `${project.durationWeeks} weeks` : "—"}</dd></div>
              </>
            )}
          </dl>
          {isClientOwner && project.status === "DRAFT" && (
            <button onClick={() => updateProjectStatus("OPEN")} className="mt-4 px-3 py-1.5 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700">
              Post to marketplace
            </button>
          )}
          {isClientOwner && project.status === "AWARDED" && (
            <button onClick={() => updateProjectStatus("IN_PROGRESS")} className="mt-4 px-3 py-1.5 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700">
              Mark in progress
            </button>
          )}
          {(isClientOwner || isPlatform) && project.status === "IN_PROGRESS" && (
            <button onClick={() => updateProjectStatus("COMPLETED")} className="mt-4 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700">
              Mark completed
            </button>
          )}
          {(isClientOwner || isPlatform) && ["DRAFT", "OPEN", "NEGOTIATING", "AWARDED", "IN_PROGRESS"].includes(project.status) && (
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

        {sourceTask && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <p className="text-sm font-semibold text-slate-900 mb-1">Linked from Keel Deliver</p>
            <p className="text-xs text-slate-500">
              Posted from task <span className="font-medium text-slate-700">{sourceTask.taskTitle}</span> in{" "}
              <Link href={`/projects/${sourceTask.deliverProjectId}`} className="text-accent-600 hover:text-accent-700 font-medium">
                {sourceTask.deliverProjectName}
              </Link>
              .
            </p>
          </div>
        )}

        {myVendorOrgs.length > 0 && project.status === "OPEN" && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-2.5">
            <p className="text-sm font-semibold text-slate-900">{isResourceRequest ? "Offer a rate" : "Submit a bid"}</p>
            <select value={bidVendorOrgId} onChange={(e) => setBidVendorOrgId(e.target.value)} className={inputCls}>
              <option value="">Bidding as...</option>
              {myVendorOrgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <div className="flex gap-2">
              <input
                placeholder={isResourceRequest ? `Your ${(project.rateType ?? "hourly").toLowerCase()} rate` : "Proposed price"}
                type="number"
                value={bidPrice}
                onChange={(e) => setBidPrice(e.target.value)}
                className={inputCls}
              />
              <input placeholder="Timeline (e.g. 8 weeks)" value={bidTimeline} onChange={(e) => setBidTimeline(e.target.value)} className={inputCls} />
            </div>
            <button onClick={submitBid} disabled={!bidVendorOrgId || !bidPrice} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700 disabled:opacity-50">
              <Send size={13} /> {isResourceRequest ? "Submit rate offer" : "Submit bid"}
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">{isResourceRequest ? "Rate Offers" : "Bids"}</p>
          <div className="space-y-2">
            {bids.map((b) => (
              <div key={b.id} className="border border-slate-100 rounded-lg">
                <button onClick={() => toggleBid(b.id)} className="w-full flex items-center justify-between p-3 text-left">
                  <div className="flex items-center gap-2">
                    {expandedBid === b.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {b.currency} {b.proposedPrice.toLocaleString()}
                        {isResourceRequest && project.rateType ? `/${project.rateType.toLowerCase()}` : ""}
                      </p>
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
              {agreements.map((a) => {
                const manageable = canManageAgreement(a);
                const financeManageable = canManageFinance(a);
                const next = AGREEMENT_NEXT_STATUS[a.status];
                const milestones = milestonesByAgreement[a.id] ?? [];
                const changeRequests = changeRequestsByAgreement[a.id] ?? [];
                const myOrgIdsForAgreement = a.parties.map((p) => p.scOrganizationId).filter((id): id is string => !!id && myOrgIds.includes(id));
                return (
                  <div key={a.id} className="border border-slate-100 rounded-lg">
                    <button onClick={() => toggleAgreement(a.id)} className="w-full flex items-center justify-between p-3 text-left">
                      <div className="flex items-center gap-2">
                        {expandedAgreement === a.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <p className="text-sm font-medium text-slate-800">{a.type.replace(/_/g, "-")}</p>
                      </div>
                      <span className="text-xs font-medium text-slate-500">{a.status}</span>
                    </button>
                    {expandedAgreement === a.id && (
                      <div className="border-t border-slate-100 p-3 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {manageable && next && (
                            <button onClick={() => updateAgreementStatus(a.id, next)} className="px-3 py-1.5 rounded-lg bg-accent-50 text-accent-600 text-xs font-medium hover:bg-accent-100">
                              {AGREEMENT_ACTION_LABEL[next]}
                            </button>
                          )}
                          <a
                            href={`/api/keelconnect/agreements/${a.id}/pdf`}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
                          >
                            Download PDF
                          </a>
                        </div>

                        {manageable && (
                          <AiEditChat
                            entityType="scAgreement"
                            entityId={a.id}
                            onApplied={() => { load(); loadChangeRequests(a.id); }}
                            placeholder='e.g. "set governing law to Delaware, USA"'
                          />
                        )}

                        {changeRequests.filter((c) => c.status === "PENDING").length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pending change requests</p>
                            {changeRequests
                              .filter((c) => c.status === "PENDING")
                              .map((c) => {
                                const canDecide = isPlatform || (manageable && !myOrgIdsForAgreement.includes(c.proposedByOrgId ?? ""));
                                let parsedChanges: Record<string, unknown> = {};
                                try {
                                  parsedChanges = JSON.parse(c.changes);
                                } catch {
                                  parsedChanges = {};
                                }
                                return (
                                  <div key={c.id} className="bg-amber-50 border border-amber-100 rounded-lg p-2.5 space-y-1.5">
                                    <div className="text-xs text-slate-600 space-y-0.5">
                                      {Object.entries(parsedChanges).map(([k, v]) => (
                                        <p key={k}><span className="font-medium">{k}</span>: {String(v)}</p>
                                      ))}
                                      {c.note && <p className="text-slate-400 italic">&quot;{c.note}&quot;</p>}
                                    </div>
                                    {canDecide && (
                                      <div className="flex gap-2">
                                        <button onClick={() => decideChangeRequest(c.id, a.id, "ACCEPTED")} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100">
                                          Accept
                                        </button>
                                        <button onClick={() => decideChangeRequest(c.id, a.id, "REJECTED")} className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 text-xs font-medium hover:bg-rose-100">
                                          Reject
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}

                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Milestones</p>
                          {milestones.length === 0 && <p className="text-xs text-slate-400">No milestones yet.</p>}
                          {milestones.map((ms) => {
                            const payments = paymentsByMilestone[ms.id] ?? [];
                            const naturalDirection =
                              a.type === "CLIENT_VENDOR" ? "CLIENT_TO_VENDOR" : a.type === "CLIENT_PLATFORM" ? "CLIENT_TO_PLATFORM" : "PLATFORM_TO_VENDOR";
                            const canRaiseThis = naturalDirection === "PLATFORM_TO_VENDOR" ? isPlatform : financeManageable;
                            return (
                              <div key={ms.id} className="bg-slate-50 rounded-lg p-2.5 space-y-1.5">
                                <div className="flex items-center justify-between text-sm">
                                  <div>
                                    <p className="font-medium text-slate-800">{ms.description}</p>
                                    <p className="text-xs text-slate-400">
                                      {ms.currency} {ms.amount.toLocaleString()}
                                      {ms.dueDate ? ` · due ${new Date(ms.dueDate).toLocaleDateString()}` : ""}
                                    </p>
                                  </div>
                                  <span className="text-xs font-medium text-slate-500 shrink-0">{ms.status}</span>
                                </div>
                                {ms.status === "PENDING" && financeManageable && (
                                  <button onClick={() => approveMilestone(ms)} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100">
                                    Approve
                                  </button>
                                )}
                                {ms.status === "APPROVED" && canRaiseThis && payments.length === 0 && (
                                  <button onClick={() => raisePayment(ms, naturalDirection)} className="px-2.5 py-1 rounded-lg bg-accent-50 text-accent-600 text-xs font-medium hover:bg-accent-100">
                                    Raise payment
                                  </button>
                                )}
                                {payments.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between text-xs text-slate-600 pl-1">
                                    <span>{p.direction.replace(/_/g, " ").toLowerCase()} · {p.currency} {p.amount.toLocaleString()}</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-slate-500">{p.status}</span>
                                      {financeManageable && p.status === "PENDING" && (p.direction === "CLIENT_TO_PLATFORM" || p.direction === "CLIENT_TO_VENDOR") && (
                                        <button onClick={() => payWithStripe(p)} className="text-accent-600 hover:text-accent-700 font-medium">
                                          Pay with Stripe
                                        </button>
                                      )}
                                      {isPlatform && p.status === "PENDING" && (
                                        <button onClick={() => updatePaymentStatus(p, "HELD")} className="text-accent-600 hover:text-accent-700">Hold (manual)</button>
                                      )}
                                      {isPlatform && p.status === "HELD" && (
                                        <button onClick={() => updatePaymentStatus(p, "RELEASED")} className="text-emerald-600 hover:text-emerald-700">Release</button>
                                      )}
                                      {isPlatform && (p.status === "PENDING" || p.status === "HELD") && (
                                        <button onClick={() => updatePaymentStatus(p, "REFUNDED")} className="text-rose-600 hover:text-rose-700">Refund</button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                          {manageable && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              <input
                                placeholder="Description"
                                value={newMilestone.description}
                                onChange={(e) => setNewMilestone((f) => ({ ...f, description: e.target.value }))}
                                className={`${inputCls} w-40`}
                              />
                              <input
                                placeholder="Amount"
                                type="number"
                                value={newMilestone.amount}
                                onChange={(e) => setNewMilestone((f) => ({ ...f, amount: e.target.value }))}
                                className={`${inputCls} w-24`}
                              />
                              <input
                                placeholder="Due date"
                                type="date"
                                value={newMilestone.dueDate}
                                onChange={(e) => setNewMilestone((f) => ({ ...f, dueDate: e.target.value }))}
                                className={`${inputCls} w-32`}
                              />
                              <button onClick={() => addMilestone(a.id)} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800">
                                Add milestone
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {project.status === "COMPLETED" && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-900">Reviews</p>
            {reviews.length === 0 && <p className="text-xs text-slate-400">No reviews yet.</p>}
            {reviews.map((r) => (
              <div key={r.id} className="text-sm border-b border-slate-50 pb-2 last:border-0">
                <p className="font-medium text-slate-800">
                  {r.fromOrgType === "CLIENT" ? "Client review" : "Vendor review"} · {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </p>
                {r.comments && <p className="text-xs text-slate-500 mt-0.5">{r.comments}</p>}
              </div>
            ))}
            {myReviewFromOrgType && !reviews.some((r) => r.fromOrgType === myReviewFromOrgType) && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <select value={reviewRating} onChange={(e) => setReviewRating(e.target.value)} className={inputCls}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} star{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
                <textarea
                  placeholder="Comments (optional)"
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  className={`${inputCls} min-h-16`}
                />
                <button onClick={submitReview} className="px-3 py-1.5 rounded-lg bg-accent-600 text-white text-xs font-medium hover:bg-accent-700">
                  Submit review
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
