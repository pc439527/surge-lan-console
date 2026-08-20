import { ArrowDown, ArrowUp, Gauge, Radio } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatRate } from "@/lib/format";

export interface MetricsData {
  uploadRate: number;
  downloadRate: number;
  activeRequests: number;
  /** /v1/outbound 探测延迟（Capability Engine）；null = 不可用。 */
  latencyMs: number | null;
  loading: boolean;
}

export function MetricCards({ data }: { data: MetricsData }) {
  if (data.loading) {
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="mt-3 h-8 w-24" />
          </Card>
        ))}
      </div>
    );
  }

  const items = [
    {
      label: "上传",
      value: formatRate(data.uploadRate),
      icon: ArrowUp,
      color: "text-accent",
      hint: "当前上传速率（所有接口合计）",
    },
    {
      label: "下载",
      value: formatRate(data.downloadRate),
      icon: ArrowDown,
      color: "text-chart-download",
      hint: "当前下载速率（所有接口合计）",
    },
    {
      label: "延迟",
      value: data.latencyMs !== null ? `${Math.round(data.latencyMs)}ms` : "—",
      icon: Gauge,
      color: "text-success",
      hint: "API 往返延迟（/v1/outbound 探测）",
    },
    {
      label: "活动连接",
      value: String(data.activeRequests),
      icon: Radio,
      color: "text-text-primary",
      hint: "Surge 当前的活动连接数（active requests）",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4" title={item.hint}>
          <div className="flex items-center gap-2">
            <item.icon className={`h-4 w-4 ${item.color}`} />
            <span className="text-[13px] text-text-secondary">{item.label}</span>
          </div>
          <p className="mt-3 text-[28px] font-semibold tabular-nums tracking-tight text-text-primary">
            {item.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
