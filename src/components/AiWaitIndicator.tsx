"use client";
import { useEffect, useState } from "react";

const DEFAULT_MESSAGES = ["Working on it...", "Still thinking...", "Almost there..."];

/**
 * Shows an elapsed-time counter + a sliding progress bar + rotating status text while an
 * AI call (or any other slow request) is in flight. AI calls here can genuinely take
 * 10-60+ seconds (project planning drafts a whole plan of tasks/milestones/costs in one
 * shot) with no real way to report true percent-complete, so this gives visible proof the
 * app is still working instead of a bare spinner that looks the same whether it's been
 * 2 seconds or 2 minutes.
 *
 * Usage: <AiWaitIndicator active={planning} messages={["Reading the goal...", "Drafting tasks..."]} />
 * Renders nothing when `active` is false.
 */
export default function AiWaitIndicator({
  active,
  messages = DEFAULT_MESSAGES,
  className = "",
}: {
  active: boolean;
  messages?: string[];
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    const cycle = setInterval(() => setMsgIndex((i) => (i + 1) % messages.length), 3000);
    return () => {
      clearInterval(tick);
      clearInterval(cycle);
      setElapsed(0);
      setMsgIndex(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div className={`rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 ${className}`}>
      <div className="relative h-1 w-full rounded-full bg-indigo-100 overflow-hidden mb-2">
        <div className="absolute inset-y-0 rounded-full bg-indigo-500 animate-ai-wait-slide" />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-indigo-700">{messages[msgIndex]}</span>
        <span className="text-indigo-400 tabular-nums">{timeLabel}</span>
      </div>
    </div>
  );
}
