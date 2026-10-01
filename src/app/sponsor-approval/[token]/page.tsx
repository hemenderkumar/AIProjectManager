import { db } from "@/lib/db";
import { approvalRequests, projects, stakeholders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import DecisionForm from "./DecisionForm";

const ENTITY_LABELS: Record<string, string> = {
  CHARTER: "the Project Charter",
  BUDGET_CHANGE_REQUEST: "a budget change request",
  GENERAL: "the item below",
};

export default async function SponsorApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [reqRow] = await db.select().from(approvalRequests).where(eq(approvalRequests.token, token));

  if (!reqRow) {
    return (
      <Shell>
        <p className="text-sm text-slate-600">
          This link is invalid or has expired. Ask the project manager to send a new one.
        </p>
      </Shell>
    );
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, reqRow.projectId));
  const [sponsor] = await db.select().from(stakeholders).where(eq(stakeholders.id, reqRow.sponsorStakeholderId));

  if (reqRow.status !== "PENDING") {
    return (
      <Shell>
        <p className="text-sm text-slate-600">
          Thanks — you already {reqRow.status === "APPROVED" ? "approved" : "declined"} this on{" "}
          {reqRow.decidedAt ? new Date(reqRow.decidedAt).toLocaleDateString() : "a previous visit"}.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-sm text-slate-500 mb-1">Hi {sponsor?.name ?? "there"},</p>
      <h1 className="text-lg font-semibold text-slate-900 mb-1">
        Approval requested — {project?.name}
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        {reqRow.requestedBy} is asking you to review and approve {ENTITY_LABELS[reqRow.entityType] ?? "this request"}.
      </p>
      {reqRow.summary && (
        <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">
          {reqRow.summary}
        </div>
      )}
      <DecisionForm token={token} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">{children}</div>
    </div>
  );
}
