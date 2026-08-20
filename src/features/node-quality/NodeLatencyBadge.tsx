import { Badge } from "@/components/ui/Badge";
import { latencyTone } from "@/lib/latency";

export function NodeLatencyBadge({ latency, reachable, testedAt }: { latency: number | null; reachable?: boolean; testedAt?: number }) {
  const label = latency === null ? (reachable ? "可达 · 无耗时" : "未测速") : Math.round(latency) + "ms";
  return <span title={testedAt ? "测速时间：" + new Date(testedAt).toLocaleTimeString() : undefined}><Badge variant={latency === null ? "muted" : latencyTone(latency)} className="font-mono tabular-nums">{label}</Badge></span>;
}
