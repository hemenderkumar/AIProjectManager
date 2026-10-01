"use client";
import { useEffect, useState } from "react";

type ApprovalRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  decisionNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  link?: string;
  emailed?: boolean;
};

const textareaCls = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

// Gives the project's Sponsor stakeholder real approval authority instead of just being a
// name on the charter -- see approvalRequests in schema.ts. Self-contained: fetches its own
// request history so it can drop into the Charter tab without the parent form's state.
export default function SponsorApprovalPanel({ projectId, hasSponsor }: { projectId: string; hasSponsor: boolean }) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/approval-requests`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setRequests(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false));
  }, [projectId]);

  const latest = requests[0] ?? null;

  async function requestApproval() {
    setRequesting(true);
    setError(null);
    setLink(null);
    const res = await fetch(`/api/projects/${projectId}/approval-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType: "CHARTER", summary: summary.trim() || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setRequesting(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't request approval.");
      return;
    }
    setRequests((prev) => [data, ...prev]);
    if (!data.emailed) setLink(data.link);
    setSummary("");
  }

  if (!hasSponsor) {
    return (
      <p className="text-xs text-slate-400">
        Pick a sponsor stakeholder on the Overview tab to be able to request their approval here.
      </p>
    );
  }

  return (
    <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-slate-700">Sponsor approval</p>
      {loading ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : latest ? (
        <p className="text-xs text-slate-600">
          Latest request: <StatusBadge status={latest.status} />{" "}
          {latest.decidedAt ? `on ${new Date(latest.decidedAt).toLocaleDateString()}` : "— awaiting sponsor"}
          {latest.decisionNote && <span className="block text-slate-500 mt-0.5">&ldquo;{latest.decisionNote}&rdquo;</span>}
        </p>
      ) : (
        <p className="text-xs text-slate-400">No approval requested yet.</p>
      )}
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="What should the sponsor review? (optional — defaults to a generic charter-approval request)"
        className={textareaCls}
        rows={2}
      />
      <button
        onClick={requestApproval}
        disabled={requesting}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
      >
        {requesting ? "Sending..." : "Request sponsor approval"}
      </button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {link && (
        <p className="text-xs text-slate-500 break-all">
          No email address on file for the sponsor — share this link with them directly: {link}
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ApprovalRequest["status"] }) {
  const cls = status === "APPROVED" ? "text-emerald-600" : status === "REJECTED" ? "text-rose-600" : "text-amber-600";
  return <span className={`font-medium ${cls}`}>{status}</span>;
}
