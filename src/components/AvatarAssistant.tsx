"use client";
import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { Send, X, Sparkles, Volume2, VolumeX } from "lucide-react";

export default function AvatarAssistant() {
  const [open, setOpen] = useState(false);
  const [gender, setGender] = useState<"female" | "male">("female");
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState("Hi, I'm your AI PM. Ask me for a status update anytime.");
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
  }, []);

  function speak(text: string) {
    setCaption(text);
    if (muted) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = voicesRef.current;
    const preferred = voices.find((v) =>
      gender === "female"
        ? /female|zira|samantha|victoria|susan|karen/i.test(v.name)
        : /male|david|daniel|alex|fred/i.test(v.name)
    );
    if (preferred) utterance.voice = preferred;
    utterance.pitch = gender === "female" ? 1.15 : 0.9;
    utterance.rate = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

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
    <div className="fixed bottom-5 right-5 w-80 bg-white rounded-xl border border-slate-200 shadow-xl z-50 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-2">
          <Avatar speaking={speaking} gender={gender} />
          <div>
            <p className="text-sm font-semibold text-slate-900">AI PM</p>
            <p className="text-[11px] text-slate-400">{speaking ? "Speaking..." : "Ready"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setGender((g) => (g === "female" ? "male" : "female"))}
            className="text-[11px] px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-500 hover:bg-slate-100"
            title="Switch voice"
          >
            {gender === "female" ? "Female voice" : "Male voice"}
          </button>
          <button onClick={() => setMuted((m) => !m)} className="text-slate-400 hover:text-slate-700 p-1" title="Mute voice">
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 p-1" aria-label="Close">
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
          onClick={() => ask("What's the status?")}
          disabled={loading}
          className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
        >
          What&apos;s the status?
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
        <button type="submit" disabled={loading} className="px-3 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50">
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
