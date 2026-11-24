import type { Config } from "tailwindcss";

/* DESIGN.md §14 tokens — use these, never raw gray/blue. */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        "primary-navy": "#16324f",
        "primary-navy-hover": "#1e4566",
        brand: { DEFAULT: "#2563eb", hover: "#1d4ed8", soft: "#dbeafe" },
        primary: { DEFAULT: "#2563eb", foreground: "#ffffff" },

        // Neutral surfaces per DESIGN.md
        canvas: "#f5f7fa",
        surface: { DEFAULT: "#ffffff", muted: "#f8fafc" },
        border: { DEFAULT: "#e2e8f0", strong: "#cbd5e1" },
        foreground: { DEFAULT: "#0f172a", muted: "#64748b" },
        "on-dark": { DEFAULT: "#f8fafc", muted: "#94a3b8" },

        // Accent
        teal: { DEFAULT: "#0f766e", soft: "#ccfbf1" },

        // Semantic
        success: { DEFAULT: "#15803d", soft: "#dcfce7" },
        warning: { DEFAULT: "#b45309", soft: "#fef3c7" },
        danger: { DEFAULT: "#b91c1c", soft: "#fee2e2" },
        info: { DEFAULT: "#0369a1", soft: "#e0f2fe" },
        disabled: "#94a3b8",

        // Nav sidebar
        nav: "#16324f",
        "nav-hover": "#1e4566",
        "nav-active": "#2563eb",
      },
      borderRadius: {
        // DESIGN.md §5
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "999px",
        /* Aliases for existing CSS classes */
        card: "8px",
        control: "6px",
        dialog: "12px",
      },
      fontFamily: {
        // DESIGN.md §3
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        // DESIGN.md §3
        display: ["34px", { lineHeight: "1.2", fontWeight: "700" }],
        h1: ["28px", { lineHeight: "1.2", fontWeight: "700" }],
        h2: ["22px", { lineHeight: "1.3", fontWeight: "650" }],
        h3: ["18px", { lineHeight: "1.35", fontWeight: "600" }],
        body: ["14px", { lineHeight: "1.55" }],
        "body-strong": ["14px", { lineHeight: "1.55", fontWeight: "600" }],
        small: ["12px", { lineHeight: "1.45" }],
        meta: ["11px", { lineHeight: "1.45", fontWeight: "500" }],
        /* Aliases for existing CSS classes */
        "page-title": ["28px", { lineHeight: "1.2", fontWeight: "700" }],
        section: ["18px", { lineHeight: "1.35", fontWeight: "600" }],
        "card-title": ["14px", { lineHeight: "1.4", fontWeight: "600" }],
        "table-body": ["13px", { lineHeight: "1.5" }],
        kpi: ["34px", { lineHeight: "1.1", fontWeight: "700" }],
      },
      spacing: {
        "control": "40px",
        "control-sm": "32px",
        /* DESIGN.md §4 */
        "2xs": "4px",
        "xs": "8px",
        "sm": "12px",
        "md": "16px",
        "lg": "24px",
        "xl": "32px",
        "2xl": "40px",
        "3xl": "48px",
      },
      boxShadow: {
        "sm": "0 1px 2px rgba(15, 23, 42, 0.06)",
        "md": "0 4px 12px rgba(15, 23, 42, 0.08)",
        "lg": "0 12px 28px rgba(15, 23, 42, 0.12)",
        "dialog": "0 20px 48px rgba(15, 23, 42, 0.18)",
      },
      transitionDuration: {
        ui: "160ms",
      },
    },
  },
  plugins: [],
};

export default config;