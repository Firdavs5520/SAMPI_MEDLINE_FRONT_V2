/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { storageKeys } from "../utils/constants.js";

const ThemeContext = createContext(null);
const DEFAULT_MODE = "system";
const MODES = ["light", "dark", "system"];

const readStoredMode = () => {
  if (typeof window === "undefined") return DEFAULT_MODE;
  const stored = String(localStorage.getItem(storageKeys.themeMode) || "").toLowerCase();
  return MODES.includes(stored) ? stored : DEFAULT_MODE;
};

const detectSystemTheme = () => {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readStoredMode);
  const [systemTheme, setSystemTheme] = useState(detectSystemTheme);
  const resolvedTheme = useMemo(
    () => (mode === "system" ? systemTheme : mode),
    [mode, systemTheme]
  );

  useEffect(() => {
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.classList.remove("theme-light", "theme-dark");
      root.classList.add(resolvedTheme === "dark" ? "theme-dark" : "theme-light");
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(storageKeys.themeMode, mode);
    }
  }, [mode, resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const syncSystemTheme = (event) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncSystemTheme);
      return () => media.removeEventListener("change", syncSystemTheme);
    }

    media.addListener(syncSystemTheme);
    return () => media.removeListener(syncSystemTheme);
  }, []);

  const setMode = (nextMode) => {
    const safeMode = String(nextMode || "").toLowerCase();
    if (!MODES.includes(safeMode)) return;
    setModeState(safeMode);
  };

  const value = useMemo(
    () => ({
      mode,
      resolvedTheme,
      setMode
    }),
    [mode, resolvedTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
