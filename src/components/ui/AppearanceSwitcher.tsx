import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { usePreferencesStore, type Appearance } from "@/stores/preferences-store";

const OPTIONS = [
  { value: "system" as const, label: "System", icon: <Monitor className="h-3.5 w-3.5" /> },
  { value: "light" as const, label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
  { value: "dark" as const, label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
];

export function AppearanceSwitcher() {
  const appearance = usePreferencesStore((s) => s.appearance);
  const setAppearance = usePreferencesStore((s) => s.setAppearance);

  return (
    <SegmentedControl<Appearance>
      label="Appearance"
      options={OPTIONS}
      value={appearance}
      onChange={setAppearance}
    />
  );
}
