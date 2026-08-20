import { ArrowDown, ArrowUp, Layers, Radio } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatBytes, formatRate } from "@/lib/format";

export interface MetricsData {
  uploadRate: number;
  downloadRate: number;
  activeRequests: number;
  totalTraffic: number;
  loading: boolean;
}

export function MetricCards({ data }: { data: MetricsData }) {
  if (data.loading) {
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 2xl:grid-cols-[repeat(4,minmax(0,420px))] 2xl:justify-center">
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
      label: "活动连接",
      value: String(data.activeRequests),
      icon: Radio,
      color: "text-success",
      hint: "Surge 当前的活动连接数（active requests）",
    },
    {
      label: "总流量",
      value: formatBytes(data.totalTraffic),
      icon: Layers,
      color: "text-text-primary",
      hint: "Surge 当前运行会话的累计流量",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 2xl:grid-cols-[repeat(4,minmax(0,420px))] 2xl:justify-center">
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