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
    },
    {
      label: "下载",
      value: formatRate(data.downloadRate),
      icon: ArrowDown,
      color: "text-[#bf5af2]",
    },
    {
      label: "活动请求",
      value: String(data.activeRequests),
      icon: Radio,
      color: "text-success",
    },
    {
      label: "总流量",
      value: formatBytes(data.totalTraffic),
      icon: Layers,
      color: "text-text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-4">
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