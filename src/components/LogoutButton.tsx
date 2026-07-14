"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Land on the marketing homepage, not straight back at the login form — same reasoning
    // as the homepage itself: don't skip past context just to get to a credentials box.
    router.push("/");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-700"
    >
      <LogOut size={13} /> Sign out
    </button>
  );
}
