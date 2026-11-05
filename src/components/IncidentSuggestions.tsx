"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Loader2, Layers } from "lucide-react";
import { formatMinutes } from "@/lib/incidentSla";

type Suggestions = {
  similar: { id: string; title: string; status: string; severity: string; score: number; problemId: string | null }[];
  evidence: { incidentId: string; title: string; notes: string; minutesToResolve: number | null }[];
  knownErrors: { id: string; title: string; workaround: string | null; runbook: string | null; rootCause: string | null }[];
  medianMinutesToResolve: number | null;
};

// "Seen this before?" panel for one incident: known-error workarounds, how similar past
// incidents were fixed, and a one-click way to raise a problem from this incident.
export default function IncidentSuggestions({ incidentId, problemId, canManage }: { incidentId: string; problemId: string | null; canManage: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<Suggestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/incidents/${incidentId}/suggestions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load suggestions"))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [incidentId]);

  async function raiseProblem() {
    setBusy(true);
    try {
      const ids = [incidentId, ...(data?.similar.filter((s) => !s.problemId).map((s) => s.id) ?? [])];
      const res = await fetch("/api/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentIds: ids }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not create problem"); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-xs text-rose-600 mb-2">{error}</p>;
  if (!data) return <p className="text-xs text-slate-400 mb-2">Checking history…</p>;
  if (!data.similar.length && !data.knownErrors.length) {
    return canManage && !problemId ? (
      <button onClick={raiseProblem} disabled={busy} className="mb-2 flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50">
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />} Raise as problem
      </button>
    ) : null;
  }

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-lg p-3 mb-3 text-xs text-slate-700 space-y-2">
      <p className="font-semibold text-amber-800 flex items-center gap-1.5"><Lightbulb size={13} /> Seen this before?</p>
      {data.knownErrors.map((k) => (
        <div key={k.id} className="bg-white border border-amber-100 rounded-md p-2">
          <p className="font-medium">Known error: {k.title}</p>
          {k.rootCause && <p className="text-slate-500">Cause: {k.rootCause}</p>}
          {k.workaround && <p>Workaround: {k.workaround}</p>}
          {k.runbook && <pre className="whitespace-pre-wrap font-sans text-slate-600 mt-1">{k.runbook}</pre>}
        </div>
      ))}
      {data.evidence.map((e) => (
        <p key={e.incidentId}>
          <span className="font-medium">&quot;{e.title}&quot;</span> was fixed{e.minutesToResolve != null ? ` in ${formatMinutes(e.minutesToResolve)}` : ""}: {e.notes}
        </p>
      ))}
      {data.similar.length > 0 && (
        <p className="text-slate-500">
          Similar: {data.similar.map((s) => `${s.title} (${s.score}%)`).join(" · ")}
          {data.medianMinutesToResolve != null && ` — typical time to resolve ${formatMinutes(data.medianMinutesToResolve)}`}
        </p>
      )}
      {canManage && !problemId && (
        <button onClick={raiseProblem} disabled={busy} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />} Raise as problem (with {data.similar.filter((s) => !s.problemId).length} similar)
        </button>
      )}
    </div>
  );
}
