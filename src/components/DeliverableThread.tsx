"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, Download, CheckCircle2, MessageSquareWarning } from "lucide-react";

type Comment = {
  id: string;
  kind: "COMMENT" | "DECISION";
  authorName: string;
  authorSide: string;
  body: string;
  attachmentFilename: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  createdAt: string;
};

const MAX_BYTES = 4 * 1024 * 1024;

function fmtSize(n: number | null) {
  if (!n) return "";
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Conversation + file sharing on a deliverable, used by both the internal Deliverables tab and
// the client portal so both sides see the same thread.
export default function DeliverableThread({ deliverableId, reloadKey = 0 }: { deliverableId: string; reloadKey?: number }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/deliverables/${deliverableId}/comments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!cancelled) {
          setComments(rows);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deliverableId, reloadKey, tick]);

  function send() {
    if (sending || (!text.trim() && !file)) return;
    if (file && file.size > MAX_BYTES) {
      setError("File is too large (max 4 MB)");
      return;
    }
    setSending(true);
    setError(null);
    const prepare = file
      ? readAsDataUrl(file).then((dataBase64) => ({ filename: file.name, mime: file.type, dataBase64 }))
      : Promise.resolve(null);
    prepare
      .then((attachment) =>
        fetch(`/api/deliverables/${deliverableId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text, attachment }),
        }),
      )
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Could not send");
        }
        setText("");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
        setTick((t) => t + 1);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setSending(false));
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {loaded && comments.length === 0 && <p className="text-xs text-slate-400">No messages yet.</p>}
        {comments.map((c) =>
          c.kind === "DECISION" ? (
            <div key={c.id} className="flex items-start gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              {/* Decision rows carry the note; the verdict is inferred from the deliverable status shown elsewhere */}
              {c.body.toLowerCase().startsWith("approved") ? (
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <MessageSquareWarning size={14} className="text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="text-slate-700">
                  <span className="font-medium">{c.authorName}</span> · {new Date(c.createdAt).toLocaleString()}
                </p>
                <p className="text-slate-600 whitespace-pre-wrap">{c.body}</p>
              </div>
            </div>
          ) : (
            <div
              key={c.id}
              className={`rounded-lg px-3 py-2 text-sm border ${
                c.authorSide === "CLIENT" ? "bg-accent-50 border-accent-100" : "bg-white border-slate-200"
              }`}
            >
              <p className="text-xs text-slate-500 mb-0.5">
                <span className="font-medium text-slate-700">{c.authorName}</span>
                {c.authorSide === "CLIENT" ? " · client" : " · team"} · {new Date(c.createdAt).toLocaleString()}
              </p>
              {c.body && <p className="text-slate-700 whitespace-pre-wrap">{c.body}</p>}
              {c.attachmentFilename && (
                <a
                  href={`/api/deliverables/${deliverableId}/comments/${c.id}/attachment`}
                  className="inline-flex items-center gap-1.5 mt-1.5 text-xs text-accent-700 border border-slate-200 rounded-md px-2 py-1 bg-white hover:bg-slate-50"
                >
                  <Download size={12} /> {c.attachmentFilename} <span className="text-slate-400">{fmtSize(c.attachmentSize)}</span>
                </a>
              )}
            </div>
          ),
        )}
      </div>

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Write a message…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-xs border border-slate-200 rounded-md px-2 py-1.5 hover:bg-slate-50"
          >
            <Paperclip size={12} /> {file ? file.name : "Attach file"}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || (!text.trim() && !file)}
            className="ml-auto inline-flex items-center gap-1.5 text-xs bg-accent-600 text-white rounded-md px-3 py-1.5 disabled:opacity-50"
          >
            <Send size={12} /> {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
