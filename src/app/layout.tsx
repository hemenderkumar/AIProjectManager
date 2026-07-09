import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KPI Project Tracker",
  description: "AI-driven, KPI-driven project portfolio tracker",
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
