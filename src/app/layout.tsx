import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keel",
  description: "Keel — from idea to a priced, staffed delivery plan, in one place",
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
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
