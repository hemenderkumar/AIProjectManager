import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import { getBrandingContext } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Executa",
  description: "Executa — from idea to a priced, staffed delivery plan, in one place",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Makes "Add to Home Screen" on iOS Safari open full-screen like a real app (iOS
  // largely ignores the web manifest's `display`, these meta tags are its own mechanism).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Executa",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Saved per-account (users.theme), not the browser, so it's the same on every device someone
  // logs into — see getBrandingContext() in lib/auth.ts. Read here, server-side, on every
  // request, so <html data-theme> is correct in the very first byte of HTML: no anti-flash
  // inline script or client-side correction needed, unlike the old localStorage-only version.
  const { theme, orgBrandColor } = await getBrandingContext();
  // Only meaningful when theme === "custom" (the [data-theme="custom"] block in globals.css
  // derives every --accent-* stop from this one variable), but harmless to always set.
  const style = orgBrandColor ? ({ "--org-brand": orgBrandColor } as React.CSSProperties) : undefined;

  return (
    <html lang="en" className="antialiased" data-theme={theme} style={style}>
      <body className="min-h-screen font-sans">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
