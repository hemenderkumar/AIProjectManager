"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, PrimaryButton } from "./ui";
import { Users, FileSearch, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";

// Plan sub-tab 5, the last gate — right after Charter is approved: build with the
// company&apos;s own people, or hire a vendor. Deciding sets deliveryMode and moves the project
// into Execution (there's no gate after this one, so it folds in what used to be the
// separate "Approve & Move to Execution" button). VENDOR also auto-creates a draft RFP
// seeded from the charter — see api/projects/[id]/resourcing-decision.
export default function ResourcingDecisionTab({ detail, onNavigate }: { detail: ProjectDetail; onNavigate: (tab: "Resources" | "Tasks") => void }) {
  const router = useRouter();
  const p = detail.project;
  const [deciding, setDeciding] = useState<"INTERNAL" | "VENDOR" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rfpCreated, setRfpCreated] = useState<{ id: string } | null>(null);

  async function decide(deliveryMode: "INTERNAL" | "VENDOR") {
    setDeciding(deliveryMode);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${p.id}/resourcing-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Couldn't record this decision.");
        return;
      }
      if (data.rfp) setRfpCreated(data.rfp);
      router.refresh();
    } finally {
      setDeciding(null);
    }
  }

  const decided = Boolean(p.deliveryMode);

  return (
    <div className="space-y-6 max-w-3xl">
      {decided ? (
        <Card title="Resourcing Decision">
          <p className="text-sm text-emerald-700 flex items-center gap-1.5 mb-3">
            <CheckCircle2 size={15} />
            Decided by {p.deliveryModeDecidedBy}: {p.deliveryMode === "INTERNAL" ? "build with internal resources" : "hire a vendor via RFP"}. This project has moved to Execution.
          </p>
          {p.deliveryMode === "INTERNAL" ? (
            <button
              onClick={() => onNavigate("Resources")}
              className="text-xs px-3 py-2 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 font-medium"
            >
              Go to Resources — match skills &amp; effort
            </button>
          ) : (
            <Link
              href="/vendor-evaluation"
              className="inline-block text-xs px-3 py-2 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 font-medium"
            >
              Go to Vendor Evaluation — refine &amp; publish the RFP
            </Link>
          )}
        </Card>
      ) : (
        <Card title="How should this project be resourced?">
          <p className="text-sm text-slate-500 mb-4">
            Charter is approved — decide whether this is built with the company&apos;s own people or by hiring a
            vendor. Either way, this moves the project into Execution.
          </p>
          {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <Users size={18} className="text-accent-600 mb-2" />
              <p className="text-sm font-semibold text-slate-900 mb-1">Internal resources</p>
              <p className="text-xs text-slate-500 mb-3">
                Staff this from the company&apos;s own team — identify required skills and effort against the
                Resources roster and Delivery &amp; Pricing role mix.
              </p>
              <PrimaryButton onClick={() => decide("INTERNAL")} disabled={deciding !== null} className="w-full flex items-center justify-center gap-1.5">
                {deciding === "INTERNAL" ? <Loader2 size={14} className="animate-spin" /> : null}
                {deciding === "INTERNAL" ? "Deciding..." : "Build internally"}
              </PrimaryButton>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <FileSearch size={18} className="text-accent-600 mb-2" />
              <p className="text-sm font-semibold text-slate-900 mb-1">Hire a vendor</p>
              <p className="text-xs text-slate-500 mb-3">
                Automatically drafts an RFP from this charter (background, scope, requirements, timeline,
                budget) — refine and publish it from Vendor Evaluation.
              </p>
              <button
                onClick={() => decide("VENDOR")}
                disabled={deciding !== null}
                className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-accent-200 text-accent-700 hover:bg-accent-50 text-sm font-medium disabled:opacity-50"
              >
                {deciding === "VENDOR" ? <Loader2 size={14} className="animate-spin" /> : null}
                {deciding === "VENDOR" ? "Deciding..." : "Initiate an RFP"}
              </button>
            </div>
          </div>
        </Card>
      )}

      {rfpCreated && (
        <p className="text-xs text-emerald-700">
          Draft RFP created — <Link href="/vendor-evaluation" className="underline">review it in Vendor Evaluation</Link>.
        </p>
      )}
    </div>
  );
}
