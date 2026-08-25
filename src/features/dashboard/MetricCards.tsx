import { ArrowDown, ArrowUp, Clock3, Database, Radio } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { formatBytes, formatRate } from "@/lib/format";

export interface MetricsData {
  uploadRate: number;
  downloadRate: number;
  activeRequests: number;
  totalTraffic: number;
  uptime: string;
  loading: boolean;
}

export function MetricCards({ data }: { data: MetricsData }) {
  if (data.loading) {
    return (
      <Card className="overflow-hidden p-0">
        <div className="dashboard-metric-grid">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="metric-cell p-4 sm:p-5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="mt-3 h-8 w-24" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const items = [
    {
      label: "上传",
      value: formatRate(data.uploadRate),
      icon: ArrowUp,
      color: "text-accent",
      dot: "bg-accent",
      hint: "当前上传速率（所有接口合计）",
    },
    {
      label: "下载",
      value: formatRate(data.downloadRate),
      icon: ArrowDown,
      color: "text-chart-download",
      dot: "bg-chart-download",
      hint: "当前下载速率（所有接口合计）",
    },
    {
      label: "本次运行流量",
      value: formatBytes(data.totalTraffic),
      icon: Database,
      color: "text-success",
      dot: "bg-success",
      hint: "Surge 本次启动后的累计上传与下载",
    },
    {
      label: "运行时长",
      value: data.uptime,
      icon: Clock3,
      color: "text-text-secondary",
      dot: "bg-text-tertiary",
      hint: "Surge 当前进程的持续运行时间",
    },
    {
      label: "活动连接",
      value: String(data.activeRequests),
      icon: Radio,
      color: "text-text-primary",
      dot: "bg-text-primary",
      hint: "Surge 当前的活动连接数（active requests）",
    },
  ];

  return (
    <Card className="overflow-hidden p-0">
      <div className="dashboard-metric-grid">
        {items.map((item) => (
          <div
            key={item.label}
            className="metric-cell relative px-4 py-4 sm:px-5 sm:py-5"
            title={item.hint}
          >
            <div className="flex items-center gap-2">
              <span className={cn("h-1.5 w-1.5 rounded-pill", item.dot)} />
              <item.icon className={cn("h-3.5 w-3.5", item.color)} aria-hidden="true" />
              <span className="text-xs font-medium text-text-secondary">{item.label}</span>
            </div>
            <p className="mt-2.5 truncate text-[24px] font-semibold tabular-nums tracking-[-0.025em] text-text-primary sm:text-[27px]">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
