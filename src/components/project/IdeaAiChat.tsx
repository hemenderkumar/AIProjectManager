"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Send, Check } from "lucide-react";
import { IDEA_CHAT_FIELDS } from "@/lib/ideaEvaluation";

type Msg = { role: "user" | "assistant"; content: string; changes?: Record<string, string | number>; applied?: boolean };

// Multi-turn AI helper for the idea stage. The model can propose field changes; they appear as
// an "Apply" card and are only saved (through the normal project PATCH) when the user clicks.
export default function IdeaAiChat({
  projectId, scope = "hub", title = "Ask the AI helper", suggestions = [], onApplied,
}: {
  projectId: string;
  scope?: "hub" | "feasibility" | "architecture";
  title?: string;
  suggestions?: string[];
  onApplied?: (changes: Record<string, string | number>) => void;
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/idea-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, scope, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "The AI helper didn't respond. Please try again.");
      } else {
        const changes = data.changes && Object.keys(data.changes).length ? data.changes : undefined;
        setMsgs([...next, { role: "assistant", content: data.reply, changes }]);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }

  async function apply(i: number) {
    const m = msgs[i];
    if (!m.changes) return;
    setError(null);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(m.changes),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Couldn't apply those changes.");
      return;
    }
    setMsgs((cur) => cur.map((x, j) => (j === i ? { ...x, applied: true } : x)));
    onApplied?.(m.changes);
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
      <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 mb-3">
        <Sparkles size={15} className="text-accent-600" /> {title}
      </p>
      {msgs.length === 0 && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)} className="text-xs px-2.5 py-1.5 rounded-full bg-accent-50 text-accent-700 hover:bg-accent-100">
              {s}
            </button>
          ))}
        </div>
      )}
      {msgs.length > 0 && (
        <div className="space-y-3 mb-3 max-h-96 overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div className={`inline-block max-w-[92%] text-left text-sm rounded-xl px-3 py-2 whitespace-pre-wrap ${m.role === "user" ? "bg-accent-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                {m.content}
              </div>
              {m.changes && (
                <div className="mt-2 text-left border border-accent-200 bg-accent-50/50 rounded-lg p-3 max-w-[92%]">
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Suggested changes</p>
                  <ul className="space-y-1 mb-2">
                    {Object.entries(m.changes).map(([k, v]) => (
                      <li key={k} className="text-xs text-slate-700">
                        <span className="font-medium">{IDEA_CHAT_FIELDS[k]?.label ?? k}:</span>{" "}
                        {typeof v === "number" ? v.toLocaleString("en-US") : String(v).slice(0, 220)}
                      </li>
                    ))}
                  </ul>
                  {m.applied ? (
                    <span className="text-xs text-emerald-700 flex items-center gap-1"><Check size={13} /> Applied</span>
                  ) : (
                    <button onClick={() => apply(i)} className="text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700">
                      Apply these changes
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {busy && <p className="text-xs text-slate-500 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Thinking…</p>}
          <div ref={endRef} />
        </div>
      )}
      {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question or tell the AI what to draft…"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
          maxLength={2000}
        />
        <button type="submit" disabled={busy || !input.trim()} className="px-3 rounded-lg bg-accent-600 text-white disabled:opacity-50" aria-label="Send">
          {busy && msgs.length === 0 ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </form>
    </div>
  );
}
