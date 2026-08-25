import { Activity, ArrowDown, ArrowUp, Clock3, RefreshCw, Router, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatRate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useConnectionStore } from "@/stores/connection-store";
import { fleetTotals, type FleetDeviceSnapshot } from "./fleet-model";
import { useFleetQueries } from "./fleet-queries";

export function FleetPage() {
  const navigate = useNavigate();
  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const setActive = useConnectionStore((s) => s.setActiveConnection);
  const queries = useFleetQueries(connections);
  const snapshots = queries.map((q) => q.data).filter((item): item is FleetDeviceSnapshot => !!item);
  const totals = fleetTotals(snapshots);
  const refreshing = queries.some((q) => q.isFetching);
  const refreshAll = () => void Promise.all(queries.map((query) => query.refetch()));
  const openDevice = (id: string) => {
    setActive(id);
    navigate("/");
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader
        eyebrow="Fleet Console"
        title="设备总览"
        description="集中查看所有已保存 Surge 设备的在线状态、请求与实时流量。"
        actions={
          <Button variant="secondary" size="sm" onClick={refreshAll} disabled={refreshing || connections.length === 0}>
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            刷新全部
          </Button>
        }
      />

      {connections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Router className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
            <p className="font-medium text-text-primary">尚未添加设备</p>
            <p className="mt-1 text-sm text-text-secondary">先在连接管理中添加 Surge，再回到设备总览。</p>
            <Button className="mt-4" onClick={() => navigate("/connections")}>添加连接</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <MetricStrip
            items={[
              { label: "在线设备", value: `${totals.online} / ${connections.length}`, detail: "当前可访问", tone: totals.online === connections.length ? "success" : "warning" },
              { label: "活动请求", value: String(totals.activeRequests), detail: "跨设备汇总", tone: "accent" },
              { label: "总下载", value: formatRate(totals.downloadRate), detail: "当前速率", tone: "accent" },
              {
                label: "总上传",
                value: formatRate(totals.uploadRate),
                detail: totals.offline + totals.missingKey > 0 ? `${totals.offline + totals.missingKey} 台需处理` : "全部正常",
                tone: totals.offline + totals.missingKey > 0 ? "warning" : "success",
              },
            ]}
          />

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">设备</h2>
                <p className="mt-0.5 text-xs text-text-tertiary">当前设备使用 Accent 标识；离线或缺少密钥的设备保留明确原因。</p>
              </div>
              <span className="text-xs tabular-nums text-text-tertiary">{connections.length} 台</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {connections.map((connection, index) => {
                const query = queries[index];
                const snapshot = query.data;
                const isActive = connection.id === activeId;

                if (query.isLoading) return <Skeleton key={connection.id} className="h-56 w-full rounded-[18px]" />;

                return (
                  <Card key={connection.id} className={cn("relative overflow-hidden", isActive && "border-accent/35")}> 
                    {isActive && <span className="absolute inset-y-5 left-0 w-[3px] rounded-r-pill bg-accent" />}
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="truncate text-[15px] font-semibold text-text-primary">{connection.name}</h2>
                            {isActive && <Badge variant="info">当前</Badge>}
                          </div>
                          <p className="mt-1 truncate font-mono text-xs text-text-tertiary">
                            {connection.protocol}://{connection.host}:{connection.port}
                          </p>
                        </div>
                        <StatusBadge snapshot={snapshot} />
                      </div>

                      {snapshot?.status === "online" ? (
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border/55 py-4">
                          <Metric icon={Clock3} label="响应" value={`${snapshot.latencyMs}ms`} />
                          <Metric icon={Activity} label="活动请求" value={String(snapshot.activeRequests)} />
                          <Metric icon={ArrowDown} label="下载" value={formatRate(snapshot.traffic?.downloadRate ?? 0)} />
                          <Metric icon={ArrowUp} label="上传" value={formatRate(snapshot.traffic?.uploadRate ?? 0)} />
                        </div>
                      ) : (
                        <div className="flex min-h-20 items-start gap-3 border-y border-border/55 py-4">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-warning/10 text-warning">
                            <ShieldAlert className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-text-primary">需要处理</p>
                            <p className="mt-1 text-xs leading-5 text-text-secondary">
                              {snapshot?.status === "missing-key"
                                ? "当前浏览器会话中没有此设备的 API Key。"
                                : snapshot?.errorMessage ?? "设备暂时不可达。"}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-text-tertiary">
                          {snapshot?.outboundMode ? `模式 ${snapshot.outboundMode.toUpperCase()}` : "未获取模式"}
                        </span>
                        <Button size="sm" variant={isActive ? "secondary" : "ghost"} onClick={() => openDevice(connection.id)}>
                          {isActive ? "当前设备" : "打开设备"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatusBadge({ snapshot }: { snapshot?: FleetDeviceSnapshot }) {
  if (!snapshot) return <Badge variant="muted">未知</Badge>;
  if (snapshot.status === "online") return <Badge variant="success">在线</Badge>;
  if (snapshot.status === "missing-key") return <Badge variant="warning">缺少密钥</Badge>;
  return <Badge variant="danger">离线</Badge>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate font-mono text-[13px] font-medium tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
