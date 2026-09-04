"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Avatar from "./Avatar";
import { Send, X, Sparkles, Volume2, VolumeX, Square, FolderPlus, FileSearch, ListChecks, Webhook, Key, Check, Copy } from "lucide-react";

type WebhookAction = { type: "create_webhook"; url: string | null; events: string[] };
type ApiKeyAction = { type: "create_api_key"; name: string; scopes: string[] };
type ChatAction = WebhookAction | ApiKeyAction;

const GREETING = "Hi, I'm your AI PM. What are you looking to do today?";
// Sticks for the length of the browser tab's session (cleared when the tab closes, not
// persisted forever) — so the greeting pops up once per visit instead of every single
// page navigation, but a returning visitor still gets greeted again next time.
const GREETED_KEY = "executa.assistantGreeted";

export default function AvatarAssistant() {
  const router = useRouter();
  const pathname = usePathname();
  // Present on every page, but not equally helpful everywhere by default — when the current
  // page is a specific project, route questions to the project-scoped assistant (grounded in
  // that project's own charter/tasks/risks/SOWs/deliverables) instead of the portfolio-wide
  // one, so "what's blocking us" actually means THIS project, not the whole portfolio.
  const projectMatch = pathname?.match(/^\/projects\/([^/?#]+)/);
  const activeProjectId = projectMatch ? projectMatch[1] : null;
  const [open, setOpen] = useState(false);
  const [gender, setGender] = useState<"female" | "male">("female");
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState(GREETING);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  // Default to caption-only (no unsolicited audio) — the panel still proactively opens with
  // the greeting text, but speech is opt-in via the mute/unmute button instead of playing out
  // loud on every fresh browser tab, which read as jarring in a shared office/meeting setting.
  const [muted, setMuted] = useState(true);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // A webhook/API key the AI PM proposed from the last answer, awaiting the user's confirm —
  // never created automatically. Cleared on every new question so a stale proposal can't get
  // confirmed after the conversation has moved on.
  const [action, setAction] = useState<ChatAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s?.avatarVoiceGender === "male" || s?.avatarVoiceGender === "female") {
          setGender(s.avatarVoiceGender);
        }
      })
      .catch(() => {});

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const load = () => {
        voicesRef.current = window.speechSynthesis.getVoices();
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }

    // Stop any in-progress speech if this component ever unmounts, so navigating away
    // can't leave the assistant talking in the background with no visible controls.
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Stops speech immediately (used by the Stop button, the mute toggle, and when the
  // panel is closed) — previously nothing ever called speechSynthesis.cancel() once
  // speech had started, so it would run to completion no matter what the user clicked.
  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  function pickVoice(voices: SpeechSynthesisVoice[], voiceGender: "female" | "male") {
    const genderPattern =
      voiceGender === "female"
        ? /female|zira|samantha|victoria|susan|karen|aria|jenny/i
        : /male|david|daniel|alex|fred|guy|ryan/i;
    // Prefer higher-quality "Natural"/"Neural"/"Premium"/"Enhanced" voices — most modern
    // browsers (Chrome, Edge, Safari) expose at least one of these alongside the default,
    // noticeably robotic system voice, and picking one is a free, no-integration way to
    // sound less like a robot.
    const qualityPattern = /natural|neural|premium|enhanced|online/i;
    return (
      voices.find((v) => genderPattern.test(v.name) && qualityPattern.test(v.name)) ??
      voices.find((v) => qualityPattern.test(v.name) && v.lang.startsWith("en")) ??
      voices.find((v) => genderPattern.test(v.name)) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      voices[0]
    );
  }

  function speak(text: string) {
    setCaption(text);
    if (muted) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const preferred = pickVoice(voicesRef.current, gender);
    if (preferred) utterance.voice = preferred;
    // Slightly closer to natural human range than the previous 1.15/0.9 extremes, and a
    // touch slower than the default 1.0 rate — reads as calmer/less clipped, not robotic.
    utterance.pitch = gender === "female" ? 1.05 : 0.95;
    utterance.rate = 0.95;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  // Proactively greet once per browser-tab session: pop the panel open on the first page
  // a visitor lands on, with a spoken/captioned "what are you looking to do?" and a few
  // one-tap starting points, instead of waiting for them to notice the floating button.
  // Doesn't repeat on every navigation within the same session.
  useEffect(() => {
    if (typeof window === "undefined" || window.sessionStorage.getItem(GREETED_KEY)) return;
    window.sessionStorage.setItem(GREETED_KEY, "1");
    const timer = setTimeout(() => {
      setOpen(true);
      speak(GREETING);
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setAction(null);
    setActionError(null);
    setCreatedKey(null);
    try {
      const endpoint = activeProjectId ? "/api/ai/project-chat" : "/api/ai/ask";
      const body = activeProjectId ? { projectId: activeProjectId, question: q } : { question: q };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      speak(data.answer ?? data.error ?? "I couldn't find an answer for that.");
      if (data.action?.type === "create_webhook" || data.action?.type === "create_api_key") {
        setAction(data.action);
      }
    } finally {
      setLoading(false);
      setQuestion("");
    }
  }

  // Confirming hits the exact same routes the Settings > Integrations forms use — same
  // validation, same requireRole("SUPER_USER") gate — so nothing about "created via chat" skips
  // a check a manual creation would have gone through.
  async function confirmAction() {
    if (!action) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (action.type === "create_webhook") {
        if (!action.url || !action.events.length) {
          setActionError("I need both a destination URL and at least one event before I can create this.");
          return;
        }
        const res = await fetch("/api/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: action.url, events: action.events }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError(data?.error || "Couldn't create that webhook.");
          return;
        }
        setAction(null);
        setCaption(`Done — webhook created for ${action.events.join(", ")}.`);
      } else {
        const res = await fetch("/api/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: action.name, scopes: action.scopes }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setActionError(data?.error || "Couldn't create that API key.");
          return;
        }
        setAction(null);
        setCreatedKey(data.rawKey);
      }
    } catch {
      setActionError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setActionBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 h-14 w-14 rounded-full bg-white border border-slate-200 shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-50"
        style={{ boxShadow: "0 8px 24px -8px color-mix(in srgb, var(--accent-600) 35%, transparent), 0 2px 6px rgba(15,23,42,0.08)" }}
        aria-label="Open AI PM assistant"
      >
        <Avatar speaking={false} gender={gender} />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-5 right-5 w-80 bg-white rounded-xl border border-slate-200/70 z-50 flex flex-col overflow-hidden"
      style={{ boxShadow: "0 20px 40px -16px color-mix(in srgb, var(--accent-600) 25%, transparent), 0 4px 12px rgba(15,23,42,0.08)" }}
    >
      <div className="panel-glow flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Avatar speaking={speaking} gender={gender} />
          <div>
            <p className="text-sm font-semibold text-slate-900">AI PM</p>
            <p className="text-xs text-slate-400">{speaking ? "Speaking..." : "Ready"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {speaking && (
            <button
              onClick={stopSpeaking}
              className="text-xs px-2 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 flex items-center gap-1"
              title="Stop speaking"
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          )}
          <button
            onClick={() => setGender((g) => (g === "female" ? "male" : "female"))}
            className="text-xs px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:bg-slate-100"
            title="Switch voice"
          >
            {gender === "female" ? "Female voice" : "Male voice"}
          </button>
          <button
            onClick={() => {
              setMuted((m) => {
                if (!m) stopSpeaking(); // muting mid-sentence should stop it now, not just prevent the next one
                return !m;
              });
            }}
            className="text-slate-400 hover:text-slate-700 p-1"
            title={muted ? "Unmute voice" : "Mute voice"}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button
            onClick={() => {
              stopSpeaking();
              setOpen(false);
            }}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed max-h-48 overflow-y-auto scrollbar-thin">
        {caption}
      </div>

      {action && (
        <div className="mx-4 mb-3 border border-accent-200 bg-accent-50/60 rounded-lg p-3 space-y-2">
          {action.type === "create_webhook" ? (
            <>
              <p className="text-xs font-semibold text-accent-900 flex items-center gap-1.5"><Webhook size={13} /> Create this webhook?</p>
              <p className="text-xs text-slate-600 break-all">{action.url || "(no URL given — tell me the destination first)"}</p>
              <p className="text-xs text-slate-500">{action.events.length ? action.events.join(", ") : "(no events matched — describe what should trigger it)"}</p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-accent-900 flex items-center gap-1.5"><Key size={13} /> Create this API key?</p>
              <p className="text-xs text-slate-600">{action.name || "(untitled key)"}</p>
              <p className="text-xs text-slate-500">scopes: {action.scopes.join(", ")}</p>
            </>
          )}
          {actionError && <p className="text-xs text-rose-600">{actionError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={confirmAction}
              disabled={actionBusy}
              className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
            >
              {actionBusy ? "Creating…" : "Confirm & create"}
            </button>
            <button onClick={() => setAction(null)} className="text-xs text-slate-500 hover:text-slate-700">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {createdKey && (
        <div className="mx-4 mb-3 border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-1.5">
          <p className="text-xs font-semibold text-amber-900">API key created — copy it now, it won&apos;t be shown again</p>
          <div className="flex items-center gap-2">
            <code className="text-xs text-amber-800 flex-1 truncate">{createdKey}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(createdKey);
                setKeyCopied(true);
                setTimeout(() => setKeyCopied(false), 1500);
              }}
              className="text-amber-700 hover:text-amber-900 shrink-0"
            >
              {keyCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        {activeProjectId ? (
          <>
            <button
              onClick={() => ask("Summarize the current status of this project, highlighting anything that needs attention.")}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-full bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50 flex items-center gap-1"
            >
              <Sparkles size={12} /> Summarize this project
            </button>
            <button
              onClick={() => ask("What's blocking progress on this project right now?")}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1"
            >
              <ListChecks size={12} /> What&apos;s blocking us?
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => ask("Give me a quick spoken status update on the whole portfolio.")}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-full bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50 flex items-center gap-1"
            >
              <Sparkles size={12} /> Brief me
            </button>
            <button
              onClick={() => ask("What needs my attention right now?")}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            >
              What needs attention?
            </button>
            <button
              onClick={() => router.push("/projects/new")}
              className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"
            >
              <FolderPlus size={12} /> Start a project
            </button>
            <button
              onClick={() => router.push("/vendor-evaluation")}
              className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"
            >
              <FileSearch size={12} /> Draft an RFP
            </button>
          </>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2 px-4 pb-4"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={activeProjectId ? "Ask about this project..." : "Ask your AI PM..."}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <button type="submit" disabled={loading} className="px-3 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors disabled:opacity-50">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
