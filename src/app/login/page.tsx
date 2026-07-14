"use client";
import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import LoginCard from "@/components/LoginCard";

function LoginScreen() {
  const params = useSearchParams();

  useEffect(() => {
    fetch("/api/activity/ping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/login" }),
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 gap-6">
      <div className="flex items-center gap-2.5">
        <Image src="/keel-mark.svg" alt="Keel" width={36} height={36} />
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">Keel</p>
          <p className="text-xs text-slate-400 leading-tight">Guiding project success</p>
        </div>
      </div>
      <LoginCard next={params.get("next") ?? undefined} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
