import { Activity, ArrowDown, ArrowUp, Clock3, RefreshCw, Router, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatRate } from "@/lib/format";
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
  const openDevice = (id: string) => { setActive(id); navigate("/"); };

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-[26px] font-semibold text-text-primary">Fleet Console</h1><p className="mt-0.5 text-sm text-text-secondary">所有已保存 Surge 设备的实时运行概览</p></div>
      <Button variant="secondary" size="sm" onClick={refreshAll} disabled={refreshing || connections.length === 0}><RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}/>刷新全部</Button>
    </header>
    {connections.length === 0 ? <Card><CardContent className="py-12 text-center"><Router className="mx-auto mb-3 h-8 w-8 text-text-tertiary"/><p className="font-medium text-text-primary">尚未添加设备</p><p className="mt-1 text-sm text-text-secondary">先在连接管理中添加 Surge，再回到 Fleet Console。</p><Button className="mt-4" onClick={() => navigate("/connections")}>添加连接</Button></CardContent></Card> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="在线设备" value={String(totals.online)} detail={connections.length + " 台设备"}/>
        <Summary label="活动请求" value={String(totals.activeRequests)} detail="跨设备汇总"/>
        <Summary label="总下载" value={formatRate(totals.downloadRate)} detail="当前速率"/>
        <Summary label="总上传" value={formatRate(totals.uploadRate)} detail={totals.offline + totals.missingKey > 0 ? (totals.offline + totals.missingKey) + " 台需处理" : "全部正常"}/>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{connections.map((connection,index) => {
        const query=queries[index]; const snapshot=query.data;
        if(query.isLoading) return <Skeleton key={connection.id} className="h-56 w-full"/>;
        return <Card key={connection.id} className={connection.id === activeId ? "border-accent/40" : undefined}><CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-sm font-semibold text-text-primary">{connection.name}</h2><p className="mt-1 truncate font-mono text-xs text-text-tertiary">{connection.protocol}://{connection.host}:{connection.port}</p></div><StatusBadge snapshot={snapshot}/></div>
          {snapshot?.status === "online" ? <div className="grid grid-cols-2 gap-3 text-xs"><Metric icon={Clock3} label="响应" value={snapshot.latencyMs + "ms"}/><Metric icon={Activity} label="活动请求" value={String(snapshot.activeRequests)}/><Metric icon={ArrowDown} label="下载" value={formatRate(snapshot.traffic?.downloadRate ?? 0)}/><Metric icon={ArrowUp} label="上传" value={formatRate(snapshot.traffic?.uploadRate ?? 0)}/></div> : <div className="flex min-h-20 items-center gap-3 rounded-sm border border-border bg-surface/50 p-3"><ShieldAlert className="h-5 w-5 shrink-0 text-warning"/><p className="text-xs text-text-secondary">{snapshot?.status === "missing-key" ? "当前浏览器会话中没有此设备的 API Key。" : snapshot?.errorMessage ?? "设备暂时不可达。"}</p></div>}
          <div className="flex items-center justify-between border-t border-border pt-3"><span className="text-xs text-text-tertiary">{snapshot?.outboundMode ? "模式 " + snapshot.outboundMode.toUpperCase() : "未获取模式"}</span><Button size="sm" variant={connection.id === activeId ? "secondary" : "ghost"} onClick={() => openDevice(connection.id)}>{connection.id === activeId ? "当前设备" : "打开设备"}</Button></div>
        </CardContent></Card>;
      })}</div>
    </>}
  </div>;
}
function Summary({label,value,detail}:{label:string;value:string;detail:string}){return <Card><CardContent className="p-4"><p className="text-xs text-text-tertiary">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{value}</p><p className="mt-1 text-xs text-text-secondary">{detail}</p></CardContent></Card>}
function StatusBadge({snapshot}:{snapshot?:FleetDeviceSnapshot}){if(!snapshot)return <Badge variant="muted">未知</Badge>; if(snapshot.status==="online")return <Badge variant="success">在线</Badge>; if(snapshot.status==="missing-key")return <Badge variant="warning">缺少密钥</Badge>; return <Badge variant="danger">离线</Badge>}
function Metric({icon:Icon,label,value}:{icon:typeof Activity;label:string;value:string}){return <div className="rounded-sm bg-surface/60 p-3"><div className="flex items-center gap-1.5 text-text-tertiary"><Icon className="h-3.5 w-3.5"/><span>{label}</span></div><p className="mt-1 font-mono text-[13px] text-text-primary">{value}</p></div>}
