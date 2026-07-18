"use client";
import { useEffect } from "react";

// Registers the no-op passthrough service worker (public/sw.js) purely so Chrome/Android
// counts the app as installable — see the long comment in sw.js for why it deliberately
// does no caching. Renders nothing; just a side effect on mount, once, app-wide.
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("service worker registration failed:", err);
      });
    }
  }, []);

  return null;
}
