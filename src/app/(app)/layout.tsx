import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AvatarAssistant from "@/components/AvatarAssistant";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex">
      <Sidebar user={user} />
      <div className="flex-1 min-w-0">{children}</div>
      <AvatarAssistant />
    </div>
  );
}
