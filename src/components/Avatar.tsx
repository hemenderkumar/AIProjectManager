"use client";

// Redesigned as an abstract "AI orb" rather than a cartoon face -- a glowing gradient sphere
// with pulsing rings (accelerating while speaking) is the visual language people already
// associate with an AI voice assistant (Siri, Gemini, ChatGPT voice mode), reads as premium
// at any size, and re-tints automatically with whichever of the app's 6 accent themes is
// active since every color here resolves through the --accent-* custom properties instead of
// literal hex values. `gender` is kept as a prop (unused visually) purely so callers that only
// know about voice selection don't need to change; the orb itself has no gender presentation.
export default function Avatar({ speaking }: { speaking: boolean; gender?: "female" | "male" }) {
  return (
    <div
      className={`relative shrink-0 h-14 w-14 flex items-center justify-center ${speaking ? "ai-orb--speaking" : ""}`}
      aria-hidden="true"
    >
      <span
        className="ai-orb-ring absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent-400) 55%, transparent), transparent 70%)" }}
      />
      <span
        className="ai-orb-ring absolute inset-[6px] rounded-full"
        style={{
          background: "radial-gradient(circle, color-mix(in srgb, var(--accent-500) 45%, transparent), transparent 70%)",
          animationDelay: "0.4s",
        }}
      />
      <span
        className="ai-orb-core relative h-8 w-8 rounded-full shadow-lg"
        style={{
          background: "radial-gradient(circle at 32% 28%, color-mix(in srgb, var(--accent-300) 90%, white), var(--accent-600) 65%, var(--accent-800) 100%)",
          boxShadow: "0 2px 10px color-mix(in srgb, var(--accent-600) 45%, transparent)",
        }}
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: "radial-gradient(circle at 38% 30%, rgba(255,255,255,0.85), transparent 45%)" }}
        />
      </span>
    </div>
  );
}
