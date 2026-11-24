import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AICMS - AI Change Management System",
  description: "Enterprise IT Infrastructure Change Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-canvas text-foreground">{children}</body>
    </html>
  );
}