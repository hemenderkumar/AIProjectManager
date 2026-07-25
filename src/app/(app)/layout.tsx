import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { getCurrentUser } from "@/lib/auth";
import { getPrMemberships, hasPlatformRole } from "@/lib/projectrequesta/access";

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
  // ProjectRequesta-only nav items are correct on the very first paint, with no flash of the
  // wrong nav while a client fetch resolves. Only two booleans cross the server/client
  // boundary -- not the raw membership rows -- since Sidebar is a client component and
  // lib/projectrequesta/access.ts pulls in the db client, which must never end up in a client
  // bundle.
  const prMemberships = await getPrMemberships(user.id);
  const isProjectRequestaMember = prMemberships.length > 0;
  const isPrPlatform = hasPlatformRole(prMemberships);

  return (
    <AppShell user={user} isProjectRequestaMember={isProjectRequestaMember} isPrPlatform={isPrPlatform}>
      {children}
    </AppShell>
  );
}
