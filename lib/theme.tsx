"use client";

// Theme plumbing. Every Theme field is written to the document root as a CSS custom
// property, which is what lets app/globals.css be written entirely in var(--x) terms —
// one stylesheet, three palettes, no per-theme class explosion.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { THEMES, THEME_ORDER, type Theme } from "./constants";

const KEY = "runpulse.theme";

interface Ctx {
  theme: Theme;
  key: string;
  setKey: (k: string) => void;
  cycle: () => void;
}

const ThemeCtx = createContext<Ctx>({
  theme: THEMES.midnight,
  key: "midnight",
  setKey: () => {},
  cycle: () => {},
});

function apply(t: Theme): void {
  const r = document.documentElement.style;
  r.setProperty("--page", t.PAGE);
  r.setProperty("--surface", t.SURFACE);
  r.setProperty("--surface2", t.SURFACE2);
  r.setProperty("--ink", t.INK);
  r.setProperty("--ink2", t.INK2);
  r.setProperty("--muted", t.MUTED);
  r.setProperty("--grid", t.GRID);
  r.setProperty("--axis", t.AXIS);
  r.setProperty("--border", t.BORDER);
  r.setProperty("--border2", t.BORDER2);
  r.setProperty("--shadow", t.SHADOW);
  r.setProperty("--hover", t.HOVER);
  r.setProperty("--accent", t.ACCENT);
  r.setProperty("--accent2", t.ACCENT2);
  r.setProperty("--glow", t.GLOW);
  r.setProperty("--good", t.GOOD);
  r.setProperty("--crit", t.CRIT);
  r.setProperty("--warn", t.WARN);
  document.documentElement.dataset.theme = t.key;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Start from the default rather than reading localStorage during render: the server
  // has no localStorage, and reading it in the initial state would make the first client
  // render disagree with the server's HTML.
  const [key, setKeyState] = useState("midnight");

  useEffect(() => {
    const saved = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    const k = saved && THEMES[saved] ? saved : "midnight";
    setKeyState(k);
    apply(THEMES[k]);
  }, []);

  const setKey = useCallback((k: string) => {
    if (!THEMES[k]) return;
    setKeyState(k);
    apply(THEMES[k]);
    try {
      window.localStorage.setItem(KEY, k);
    } catch {
      // private browsing or a full quota — the theme just will not persist
    }
  }, []);

  const cycle = useCallback(() => {
    const i = THEME_ORDER.indexOf(key);
    setKey(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
  }, [key, setKey]);

  return (
    <ThemeCtx.Provider value={{ theme: THEMES[key] ?? THEMES.midnight, key, setKey, cycle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = (): Ctx => useContext(ThemeCtx);
