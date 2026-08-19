import { Toaster as SonnerToaster } from "sonner";
import { usePreferencesStore } from "@/stores/preferences-store";
import type { ResolvedTheme } from "@/lib/theme";

export function Toaster() {
  const appearance = usePreferencesStore((s) => s.appearance);
  const theme: ResolvedTheme = appearance === "system" ? "light" : appearance;

  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--glass)",
          border: "1px solid var(--glass-border)",
          backdropFilter: "blur(28px) saturate(180%)",
          color: "var(--text-primary)",
        },
      }}
    />
  );
}
