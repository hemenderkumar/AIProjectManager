"use client";
import { useEffect, useRef, useState } from "react";

// Lightweight scroll-triggered fade+rise wrapper for marketing sections (the public homepage
// only) -- IntersectionObserver rather than a scroll listener so it's cheap, and it disconnects
// itself after the first reveal since these sections never need to hide again once seen. Kept
// deliberately generic (wraps any children in a div) rather than baked into each section, so
// the homepage can opt individual blocks in with one line.
export default function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Respect reduced-motion preferences -- computed once, lazily, rather than set from inside
  // the effect below (which would trigger an extra render pass just for this check).
  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const el = ref.current;
    // Nothing to observe once already visible (reduced-motion case above) -- setting it again
    // on intersection would be harmless but there's no reason to attach the observer at all.
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // Intentionally mount-only: `visible` is read here only to skip attaching an observer
    // that's already served its purpose, not to keep the effect reactive to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      className={`${className} transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
