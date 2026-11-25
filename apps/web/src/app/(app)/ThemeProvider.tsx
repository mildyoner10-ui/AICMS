"use client";

import { createContext, useContext, useEffect, useCallback, useState, ReactNode } from "react";

interface ThemeContextValue {
  theme: "light" | "dark" | "system";
  effectiveTheme: "light" | "dark";
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  effectiveTheme: "light",
  toggleTheme: () => {},
});

function getPreferredTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("app-theme") : null;
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(effective: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-bs-theme", effective);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [userTheme, setUserTheme] = useState<"light" | "dark" | "system">("system");
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">("light");

  // Hydrate theme on mount — sync with the inline script in head
  useEffect(() => {
    const initial = getPreferredTheme();
    setUserTheme("system");
    applyTheme(initial);
    setEffectiveTheme(initial);

    // Cleanup: remove the inline theme script once React owns the toggle
    const scripts = document.querySelectorAll('script[data-theme-hydrate]');
    scripts.forEach((s) => s.remove());
  }, []);

  // Watch system preference changes
  useEffect(() => {
    if (userTheme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const theme = e.matches ? "dark" : "light";
      applyTheme(theme);
      setEffectiveTheme(theme);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [userTheme]);

  const toggleTheme = useCallback(() => {
    const current = localStorage.getItem("app-theme");
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("app-theme", next);
    setUserTheme(next);
    applyTheme(next);
    setEffectiveTheme(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: userTheme, effectiveTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
