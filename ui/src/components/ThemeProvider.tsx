"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: "dark" | "light";
  preference: Theme;
  toggle: () => void;
  setPreference: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  preference: "dark",
  toggle: () => {},
  setPreference: () => {},
});

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(pref: Theme): "dark" | "light" {
  return pref === "system" ? getSystemTheme() : pref;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<Theme>("dark");
  const [resolved, setResolved] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme) || "system";
    setPreferenceState(stored);
    setResolved(resolveTheme(stored));
    document.documentElement.setAttribute("data-theme", resolveTheme(stored));
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const t = getSystemTheme();
      setResolved(t);
      document.documentElement.setAttribute("data-theme", t);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  const apply = useCallback((pref: Theme) => {
    const t = resolveTheme(pref);
    setPreferenceState(pref);
    setResolved(t);
    localStorage.setItem("theme", pref);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  const toggle = useCallback(() => {
    apply(resolved === "dark" ? "light" : "dark");
  }, [resolved, apply]);

  return (
    <ThemeContext.Provider value={{ theme: resolved, preference, toggle, setPreference: apply }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
