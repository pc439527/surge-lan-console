import { useEffect, useState } from "react";
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

/**
 * Reactive resolved theme ("light" | "dark") for components that need the
 * actual value (e.g. CodeMirror theme selection, T12). Tracks the store and
 * live system changes, so editor themes follow Appearance switching.
 */
export function useResolvedTheme(): ResolvedTheme {
  const appearance = usePreferencesStore((s) => s.appearance);
  const canDetect =
    typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    canDetect ? resolveTheme(appearance) : "light",
  );

  useEffect(() => {
    if (!canDetect) return;
    setResolved(resolveTheme(appearance));
    if (appearance !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(resolveTheme("system"));
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [appearance, canDetect]);

  return resolved;
}
