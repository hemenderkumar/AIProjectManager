"use client";
import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  authorUserId: string | null;
  authorName: string | null;
};

type Member = { userId: string; name: string; email: string | null };

// In-context task comments + @mentions (#262). Follows the same "collapsed until clicked"
// pattern as AiEditChat: a lightweight text trigger inline in the task row, expanding into a
// self-contained panel only when someone actually wants to read/write comments -- keeps the
// dense task table from growing a comment thread under every single row by default.
export default function TaskComments({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [commentsRes, membersRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/tasks/${taskId}/comments`),
        fetch(`/api/projects/${projectId}/members`),
      ]);
      if (commentsRes.ok) setComments(await commentsRes.json());
      if (membersRes.ok) setMembers(await membersRes.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && comments.length === 0 && !loading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function post() {
    if (!body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't post that comment.");
        return;
      }
      setComments((prev) => [...prev, data]);
      setBody("");
      setShowMentions(false);
    } finally {
      setPosting(false);
    }
  }

  // Cheap "@" autocomplete: trigger on a trailing "@word" fragment, filter project members by
  // name prefix. Matches the substring-based mention detection on the server (findMentionedMembers)
  // rather than a structured token, so what's typed here is exactly what gets matched there.
  const mentionQuery = (() => {
    const m = body.match(/@(\w*)$/);
    return m ? m[1].toLowerCase() : null;
  })();
  const mentionCandidates =
    mentionQuery !== null ? members.filter((m) => m.name.toLowerCase().startsWith(mentionQuery)).slice(0, 5) : [];

  function insertMention(name: string) {
    setBody((b) => b.replace(/@(\w*)$/, `@${name} `));
    setShowMentions(false);
    inputRef.current?.focus();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent-600"
      >
        <MessageSquare size={12} /> Comments{comments.length > 0 ? ` (${comments.length})` : ""}
      </button>
    );
  }

  return (
    <div className="border border-slate-200 bg-slate-50/60 rounded-lg p-3 space-y-2 max-w-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
          <MessageSquare size={12} /> Comments
        </p>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs">
          Close
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-slate-400">No comments yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
              <p className="font-medium text-slate-700">{c.authorName ?? "Unknown"}</p>
              <p className="text-slate-600 whitespace-pre-wrap">{c.body}</p>
              <p className="text-slate-300 mt-0.5">{new Date(c.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-rose-600">{error}</p>}

      <div className="relative">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setShowMentions(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !posting) post();
            }}
            placeholder="Write a comment, @name to mention..."
            className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500"
            disabled={posting}
          />
          <button
            onClick={post}
            disabled={posting || !body.trim()}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white disabled:opacity-50 font-medium shrink-0"
          >
            {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </button>
        </div>
        {showMentions && mentionCandidates.length > 0 && (
          <div className="absolute left-0 right-10 mt-1 bg-white border border-slate-200 rounded-lg shadow-md z-10 overflow-hidden">
            {mentionCandidates.map((m) => (
              <button
                key={m.userId}
                onClick={() => insertMention(m.name)}
                className="block w-full text-left text-xs px-2.5 py-1.5 hover:bg-slate-50 text-slate-700"
              >
                @{m.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
