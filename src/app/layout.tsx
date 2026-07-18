import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Keel",
  description: "Keel — from idea to a priced, staffed delivery plan, in one place",
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
    title: "Keel",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F172A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <head>
        {/* Applies the saved theme to <html> before first paint, so a returning visitor with
            a non-default theme doesn't see a flash of indigo before ThemeSwitcher's own effect
            runs. Deliberately a plain inline script, not a client component — it has to run
            before hydration, synchronously, blocking nothing else. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('keel.theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-screen font-sans">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
