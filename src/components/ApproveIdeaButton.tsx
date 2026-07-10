"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function ApproveIdeaButton({ projectId, hasTasks }: { projectId: string; hasTasks: boolean }) {
  const router = useRouter();
  const [approving, setApproving] = useState(false);

  async function approve() {
    setApproving(true);
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "EXECUTION" }),
    });
    setApproving(false);
    // If the idea never got a task plan, land in Tasks with the AI planner ready to go;
    // otherwise just open the project as-is — nothing gets regenerated or re-entered.
    router.push(hasTasks ? `/projects/${projectId}` : `/projects/${projectId}?autoplan=1`);
  }

  return (
    <button
      onClick={approve}
      disabled={approving}
      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {approving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
      Approve & Start Execution
    </button>
  );
}
