import { useEffect } from "react";
import {
  usePreferencesStore,
  type Appearance,
} from "@/stores/preferences-store";

export type ResolvedTheme = "light" | "dark";

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function resolveTheme(appearance: Appearance): ResolvedTheme {
  return appearance === "system" ? systemTheme() : appearance;
}

/** Apply the resolved theme to <html data-theme> + .dark class. */
export function applyTheme(appearance: Appearance): ResolvedTheme {
  const resolved = resolveTheme(appearance);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", resolved === "dark");
  return resolved;
}

/** Keeps the document theme in sync with the preferences store (incl. system changes). */
export function useThemeSync() {
  const appearance = usePreferencesStore((s) => s.appearance);

  useEffect(() => {
    applyTheme(appearance);

    if (appearance !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [appearance]);
}
