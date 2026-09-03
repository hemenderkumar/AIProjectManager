"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { Send, X, Volume2, VolumeX, Square, UserPlus, Sparkles } from "lucide-react";

const GREETING =
  "Hi, I'm Executa's AI PM. Tell me what you're working on and I'll show you how this could help — or ask me anything about the product.";
// Separate key from the in-app assistant's (executa.assistantGreeted) -- a logged-out visitor
// who later signs up and lands in the real app should still get greeted once there too.
const GREETED_KEY = "executa.publicAssistantGreeted";

// The logged-out sibling of AvatarAssistant (the in-app "AI PM"). Same visual language and
// voice/caption mechanics, but it has no portfolio to ground answers in -- it's a marketing
// concierge backed by /api/public/ask: explain what Executa is, help a visitor work out if it
// fits what they're doing, and nudge toward creating a free account. Deliberately a separate
// component rather than a mode flag on AvatarAssistant: the quick-action prompts, backing
// endpoint, and greeting are different enough that sharing one file would mean branching most
// of it anyway. Complements (doesn't replace) PublicIntakeTeaser -- that's for someone who
// already has a specific idea to classify; this is for someone who just wants to ask questions.
export default function PublicAvatarAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState(GREETING);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(true);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const load = () => {
        voicesRef.current = window.speechSynthesis.getVoices();
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  function pickVoice(voices: SpeechSynthesisVoice[]) {
    const qualityPattern = /natural|neural|premium|enhanced|online/i;
    return (
      voices.find((v) => /female|zira|samantha|victoria|susan|karen|aria|jenny/i.test(v.name) && qualityPattern.test(v.name)) ??
      voices.find((v) => qualityPattern.test(v.name) && v.lang.startsWith("en")) ??
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
    const preferred = pickVoice(voicesRef.current);
    if (preferred) utterance.voice = preferred;
    utterance.pitch = 1.05;
    utterance.rate = 0.95;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  // Same "greet once per browser-tab session" pattern as the in-app assistant, own key so it
  // doesn't collide with (or get suppressed by) that one.
  useEffect(() => {
    if (typeof window === "undefined" || window.sessionStorage.getItem(GREETED_KEY)) return;
    window.sessionStorage.setItem(GREETED_KEY, "1");
    const timer = setTimeout(() => {
      setOpen(true);
      speak(GREETING);
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/public/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => ({}));
      speak(data.answer ?? data.error ?? "I couldn't find an answer for that.");
    } finally {
      setLoading(false);
      setQuestion("");
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
        <Avatar speaking={false} />
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
          <Avatar speaking={speaking} />
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
            onClick={() => {
              setMuted((m) => {
                if (!m) stopSpeaking();
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

      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        <button
          onClick={() => ask("What is Executa, in a nutshell?")}
          disabled={loading}
          className="text-xs px-2.5 py-1.5 rounded-full bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50 flex items-center gap-1"
        >
          <Sparkles size={12} /> What is this?
        </button>
        <button
          onClick={() => ask("Is Executa a fit for a small team, or just for a full consultancy?")}
          disabled={loading}
          className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
        >
          Is this for me?
        </button>
        <button
          onClick={() => ask("How does pricing and the free trial work?")}
          disabled={loading}
          className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
        >
          Pricing?
        </button>
        <button
          onClick={() => router.push("/register")}
          className="text-xs px-2.5 py-1.5 rounded-full bg-accent-600 text-white hover:bg-accent-700 flex items-center gap-1"
        >
          <UserPlus size={12} /> Create free account
        </button>
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
          placeholder="Ask about Executa..."
          maxLength={400}
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <button type="submit" disabled={loading} className="px-3 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors disabled:opacity-50">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
