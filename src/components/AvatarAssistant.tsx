"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { Send, X, Sparkles, Volume2, VolumeX, Square, FolderPlus, FileSearch } from "lucide-react";

const GREETING = "Hi, I'm your AI PM. What are you looking to do today?";
// Sticks for the length of the browser tab's session (cleared when the tab closes, not
// persisted forever) — so the greeting pops up once per visit instead of every single
// page navigation, but a returning visitor still gets greeted again next time.
const GREETED_KEY = "keel.assistantGreeted";

export default function AvatarAssistant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [gender, setGender] = useState<"female" | "male">("female");
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState(GREETING);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

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
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      speak(data.answer ?? "I couldn't find an answer for that.");
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
        aria-label="Open AI PM assistant"
      >
        <Avatar speaking={false} gender={gender} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 w-80 bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 shadow-xl z-50 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <Avatar speaking={speaking} gender={gender} />
          <div>
            <p className="text-sm font-semibold text-slate-900">AI PM</p>
            <p className="text-[11px] text-slate-400">{speaking ? "Speaking..." : "Ready"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {speaking && (
            <button
              onClick={stopSpeaking}
              className="text-[11px] px-2 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 flex items-center gap-1"
              title="Stop speaking"
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          )}
          <button
            onClick={() => setGender((g) => (g === "female" ? "male" : "female"))}
            className="text-[11px] px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:bg-slate-100"
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

      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        <button
          onClick={() => ask("Give me a quick spoken status update on the whole portfolio.")}
          disabled={loading}
          className="text-xs px-2.5 py-1.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50 flex items-center gap-1"
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
          placeholder="Ask your AI PM..."
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button type="submit" disabled={loading} className="px-3 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors disabled:opacity-50">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
