import type { Metadata } from "next";
import "./globals.css";
// Bootstrap CSS imported directly so responsive classes work
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.min.css";

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
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem("app-theme");
                  var theme = (t === "light" || t === "dark") ? t : "dark";
                  document.documentElement.setAttribute("data-bs-theme", theme);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
