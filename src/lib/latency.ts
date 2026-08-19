/** Latency color thresholds (PROJECT_SPEC §21). */
export function latencyTone(latency: number | null | undefined): "success" | "warning" | "danger" | "muted" {
  if (latency === null || latency === undefined) return "muted";
  if (latency < 100) return "success";
  if (latency <= 250) return "warning";
  return "danger";
}
