"use client";

export default function Avatar({ speaking, gender }: { speaking: boolean; gender: "female" | "male" }) {
  const hair = gender === "female" ? "#7c3aed" : "#334155";
  const skin = "#fbbf9d";

  return (
    <svg viewBox="0 0 100 100" width="56" height="56" className="shrink-0">
      <circle cx="50" cy="52" r="34" fill={skin} />
      {gender === "female" ? (
        <path d="M16 46 C16 20 84 20 84 46 L84 58 C74 46 68 40 50 40 C32 40 26 46 16 58 Z" fill={hair} />
      ) : (
        <path d="M18 44 C18 22 82 22 82 44 L82 34 C82 30 18 30 18 34 Z" fill={hair} />
      )}
      <circle cx="38" cy="52" r={speaking ? 3.2 : 3} fill="#1e293b" />
      <circle cx="62" cy="52" r={speaking ? 3.2 : 3} fill="#1e293b" />
      <path
        d={speaking ? "M40 66 Q50 76 60 66" : "M42 66 Q50 70 58 66"}
        stroke="#1e293b"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        style={{ transition: "d 120ms ease-in-out" }}
      />
      {speaking && (
        <>
          <circle cx="14" cy="30" r="2" fill="#a5b4fc" opacity="0.8">
            <animate attributeName="cy" values="30;22;30" dur="1.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="86" cy="30" r="2" fill="#a5b4fc" opacity="0.8">
            <animate attributeName="cy" values="30;22;30" dur="1.4s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </svg>
  );
}
