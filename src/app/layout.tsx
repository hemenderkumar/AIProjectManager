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
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
