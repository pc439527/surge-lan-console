import { useEffect, useState } from "react";

/**
 * True while the document is visible (page in the foreground).
 * Driving polling cadence off this satisfies AGENTS.md §5: background
 * tabs must drop or pause traffic polling instead of hammering Surge.
 */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}
