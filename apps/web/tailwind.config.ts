import type { Config } from "tailwindcss";

/* Flip7 Design System tokens */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand teal
        teal: {
          DEFAULT: "#2ba8a2",
          light: "#3cc4bd",
          dark: "#1e8c86",
          bg: "#e8f6f5",
        },
        // Gold accent
        gold: {
          DEFAULT: "#ffd23f",
          light: "#ffe47a",
          dark: "#e6b800",
        },
        // Coral
        coral: {
          DEFAULT: "#ef6c4a",
          light: "#ff8a6a",
          dark: "#d45233",
        },
        // Surface
        canvas: "#eff8f7",
        surface: { DEFAULT: "#ffffff", muted: "#fff8e7" },
        cream: "#fff8e7",
        border: { DEFAULT: "#c8dce0", strong: "#a0b8c0" },
        foreground: { DEFAULT: "#1e3a4a", muted: "#5a7a8a" },
        // Info / semantic
        sky: "#5dade2",
        success: { DEFAULT: "#27ae60", soft: "#d4efda" },
        warning: { DEFAULT: "#ef6c4a", soft: "#fde8e0" },
        danger: { DEFAULT: "#e74c3c", soft: "#fde8e8" },
        info: { DEFAULT: "#5dade2", soft: "#d6eaf8" },
      },
      borderRadius: {
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        pill: "999px",
        card: "16px",
        control: "8px",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "PingFang SC",
          "Microsoft YaHei",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      fontSize: {
        display: ["48px", { fontWeight: "800", letterSpacing: "0.03em" }],
        h1: ["36px", { fontWeight: "800", letterSpacing: "0.02em" }],
        h2: ["32px", { fontWeight: "800", letterSpacing: "0.02em" }],
        h3: ["28px", { fontWeight: "700" }],
        body: ["16px", { fontWeight: "500" }],
        small: ["14px", { fontWeight: "500" }],
        meta: ["12px", { fontWeight: "600", letterSpacing: "0.06em" }],
        "page-title": ["36px", { fontWeight: "800", letterSpacing: "0.02em" }],
        section: ["28px", { fontWeight: "700" }],
        "card-title": ["16px", { fontWeight: "800", letterSpacing: "0.05em" }],
        "table-body": ["14px", { fontWeight: "500" }],
        kpi: ["48px", { fontWeight: "800", letterSpacing: "-0.02em" }],
      },
      spacing: {
        control: "48px",
        "control-sm": "40px",
        xs: "8px",
        sm: "16px",
        md: "24px",
        lg: "32px",
        xl: "48px",
      },
      boxShadow: {
        sm: "0 2px 8px rgba(0, 0, 0, 0.08)",
        md: "0 4px 16px rgba(0, 0, 0, 0.12)",
        lg: "0 8px 32px rgba(0, 0, 0, 0.16)",
        "card": "0 4px 20px rgba(43, 168, 162, 0.10)",
        "coral-glow": "0 4px 20px rgba(239, 108, 74, 0.35)",
        "teal-glow": "0 4px 20px rgba(43, 168, 162, 0.30)",
        "accent-glow": "0 4px 20px rgba(255, 210, 63, 0.40)",
        "sky-glow": "0 4px 16px rgba(93, 173, 226, 0.30)",
      },
      animation: {
        "glow-pulse": "glowPulse 2s ease-in-out infinite",
        "crown-bounce": "crownBounce 1.5s ease-in-out infinite",
        "boom-pulse": "boomPulse 2s ease-in-out infinite",
      },
      keyframes: {
        glowPulse: {
          "0%, 100%": { opacity: "0.5", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.03)" },
        },
        crownBounce: {
          "0%, 100%": { transform: "rotate(-4deg)" },
          "25%": { transform: "rotate(4deg)" },
          "50%": { transform: "rotate(-2deg)" },
          "75%": { transform: "rotate(2deg)" },
        },
        boomPulse: {
          "0%, 100%": { boxShadow: "0 4px 20px rgba(239, 108, 74, 0.35)" },
          "50%": { boxShadow: "0 4px 30px rgba(239, 108, 74, 0.55)" },
        },
      },
      transitionDuration: {
        ui: "150ms",
      },
    },
  },
  plugins: [],
};

export default config;
