import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { getScMemberships, hasPlatformRole } from "@/lib/keelconnect/access";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Resolved server-side (not fetched client-side) so the Sidebar's track switcher and
  // KeelConnect-only nav items are correct on the very first paint, with no flash of the
  // wrong nav while a client fetch resolves. Only two booleans cross the server/client
  // boundary -- not the raw membership rows -- since Sidebar is a client component and
  // lib/keelconnect/access.ts pulls in the db client, which must never end up in a client
  // bundle.
  const scMemberships = await getScMemberships(user.id);
  const isKeelConnectMember = scMemberships.length > 0;
  const isScPlatform = hasPlatformRole(scMemberships);

  return (
    <AppShell user={user} isKeelConnectMember={isKeelConnectMember} isScPlatform={isScPlatform}>
      {children}
    </AppShell>
  );
}
