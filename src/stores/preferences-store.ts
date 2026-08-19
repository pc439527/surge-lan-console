import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Appearance = "system" | "light" | "dark";

interface PreferencesState {
  appearance: Appearance;
  /** Demo mode serves mock Surge data so the UI works without a device. */
  demoMode: boolean;
  setAppearance: (appearance: Appearance) => void;
  setDemoMode: (enabled: boolean) => void;
}

const STORAGE_KEY = "surge-lan-console.preferences";

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      appearance: "system",
      demoMode: false,
      setAppearance: (appearance) => set({ appearance }),
      setDemoMode: (enabled) => set({ demoMode: enabled }),
    }),
    {
      name: STORAGE_KEY,
    },
  ),
);

export { STORAGE_KEY };