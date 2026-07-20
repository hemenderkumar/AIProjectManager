"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Field, inputCls } from "./ui";
import { UserPlus, Loader2, CheckCircle2, XCircle, Clock, Trash2 } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

const DECISION_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  CHANGES_REQUESTED: "bg-rose-50 text-rose-700",
};

const DECISION_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock size={11} />,
  APPROVED: <CheckCircle2 size={11} />,
  CHANGES_REQUESTED: <XCircle size={11} />,
};

type Candidate = { id: string; name: string; email: string; role: string };

// Everyone invited here must explicitly approve before Idea & Alignment can advance to
// Technical Feasibility — no majority, no single sign-off (see idea_reviewers in
// db/schema.ts). A PM or the company owner (SUPER_USER) pulls in whoever from the same
// company/team should weigh in; each person then responds for themselves below.
export default function IdeaReviewersPanel({
  projectId,
  reviewers,
  currentUser,
  canInvite,
}: {
  projectId: string;
  reviewers: ProjectDetail["ideaReviewers"];
  currentUser: SessionUser | null;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [responding, setResponding] = useState(false);

  async function openInvite() {
    setShowInvite(true);
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/idea-reviewers/candidates`);
      const data = await res.json().catch(() => []);
      setCandidates(Array.isArray(data) ? data : []);
    } finally {
      setLoadingCandidates(false);
    }
  }

  async function invite(userId: string) {
    setInviting(userId);
    await fetch(`/api/projects/${projectId}/idea-reviewers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setInviting(null);
    setCandidates((c) => c.filter((u) => u.id !== userId));
    router.refresh();
  }

  async function uninvite(reviewerId: string) {
    await fetch(`/api/projects/${projectId}/idea-reviewers/${reviewerId}`, { method: "DELETE" });
    router.refresh();
  }

  async function respond(reviewerId: string, decision: "APPROVED" | "CHANGES_REQUESTED") {
    setResponding(true);
    await fetch(`/api/projects/${projectId}/idea-reviewers/${reviewerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comment: comment.trim() || null }),
    });
    setResponding(false);
    setComment("");
    router.refresh();
  }

  const myReviewerRow = currentUser ? reviewers.find((r) => r.userId === currentUser.id) : undefined;
  const allApproved = reviewers.length > 0 && reviewers.every((r) => r.decision === "APPROVED");

  return (
    <div className="border-t border-slate-200 pt-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-slate-700">
          Group alignment ({reviewers.length} invited{reviewers.length > 0 ? `, ${reviewers.filter((r) => r.decision === "APPROVED").length} approved` : ""})
        </p>
        {canInvite && (
          <button
            onClick={openInvite}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
          >
            <UserPlus size={13} /> Invite someone to weigh in
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-2">
        Everyone invited here must approve before this idea can move to Technical Feasibility — not a majority, everyone.
      </p>

      {allApproved && (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5 mb-2">
          <CheckCircle2 size={13} /> Everyone has approved — this idea is confirmed.
        </p>
      )}

      {showInvite && (
        <div className="mb-3 p-3 bg-slate-50 rounded-lg">
          {loadingCandidates ? (
            <p className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading people...</p>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-slate-400">No one else in this company/team to invite right now.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {candidates.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs bg-white rounded-lg border border-slate-200 px-2.5 py-1.5">
                  <span className="text-slate-700">{c.name} <span className="text-slate-400">· {c.email}</span></span>
                  <button
                    onClick={() => invite(c.id)}
                    disabled={inviting === c.id}
                    className="text-accent-600 hover:text-accent-700 font-medium disabled:opacity-50"
                  >
                    {inviting === c.id ? "Inviting..." : "Invite"}
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setShowInvite(false)} className="mt-2 text-xs text-slate-400 hover:text-slate-600">
            Close
          </button>
        </div>
      )}

      {reviewers.length === 0 ? (
        <p className="text-xs text-slate-400">No one invited yet.</p>
      ) : (
        <div className="space-y-1.5">
          {reviewers.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">{r.name} <span className="text-slate-400 font-normal">· {r.email}</span></span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${DECISION_STYLES[r.decision]}`}>
                    {DECISION_ICONS[r.decision]} {r.decision === "CHANGES_REQUESTED" ? "Changes requested" : r.decision === "APPROVED" ? "Approved" : "Pending"}
                  </span>
                  {canInvite && (
                    <button onClick={() => uninvite(r.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
              {r.comment && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {myReviewerRow && myReviewerRow.decision === "PENDING" && (
        <div className="mt-3 p-3 rounded-lg border border-accent-200 bg-accent-50/60">
          <p className="text-xs font-semibold text-accent-900 mb-2">You&apos;ve been invited to weigh in on this idea</p>
          <Field label="Comment (optional)">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} className={inputCls} rows={2} />
          </Field>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => respond(myReviewerRow.id, "APPROVED")}
              disabled={responding}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 font-medium"
            >
              Approve
            </button>
            <button
              onClick={() => respond(myReviewerRow.id, "CHANGES_REQUESTED")}
              disabled={responding}
              className="text-xs px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 font-medium"
            >
              Request changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
