import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  CloudOff,
  Inbox,
  KeyRound,
  Loader2,
  RefreshCw,
  ServerOff,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useSurgeClient, useSurgeClientState } from "@/app/surge-client-context";
import { NoClientNotice } from "@/features/shared/NoClientNotice";
import { runApiDiagnostics, type DiagnosticsReport, type EndpointDiagnostic } from "./diagnostics";
import { cn } from "@/lib/cn";

/**
 * API Diagnostics (OPTIMIZATION_PLAN Task 04, §17–19 / §77–78).
 * Probes every known Surge endpoint and shows HTTP status, latency, parser
 * state and result counts — so "Modules empty" can be told apart from
 * "404 Unsupported" / "parse failed" / "network error".
 */

const STATE_META: Record<EndpointDiagnostic["state"], { label: string; variant: "success" | "warning" | "danger" | "muted" | "default" }> = {
  ok: { label: "OK", variant: "success" },
  empty: { label: "空", variant: "muted" },
  "parse-error": { label: "解析失败", variant: "danger" },
  unsupported: { label: "不支持", variant: "warning" },
  unauthorized: { label: "未授权", variant: "danger" },
  "network-error": { label: "网络错误", variant: "danger" },
  timeout: { label: "超时", variant: "warning" },
  "server-error": { label: "服务错误", variant: "danger" },
  "api-error": { label: "API 错误", variant: "danger" },
};

export function DiagnosticsPage() {
  const { client, connection, demoMode } = useSurgeClientState();
  const surgeClient = useSurgeClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const report = useMutation({
    mutationFn: ({ signal }: { signal?: AbortSignal }) =>
      runApiDiagnostics(surgeClient!, connection?.name ?? "Surge", signal),
  });

  if (!client) return <NoClientNotice page="API Diagnostics" />;

  const run = () => report.mutate({});

  const data: DiagnosticsReport | undefined = report.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold text-text-primary">API Diagnostics</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            {connection ? `${connection.name} · ${connection.host}:${connection.port}` : "当前连接"}
            {demoMode ? " · 演示模式" : ""}
          </p>
        </div>
        <Button onClick={run} disabled={report.isPending}>
          {report.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {report.isPending ? "探测中…" : "运行诊断"}
        </Button>
      </header>

      {!data && !report.isPending && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ActivityIcon />
            <p className="text-sm text-text-secondary">
              对当前 Surge 实例逐个探测已知 API 端点，确认连接、认证与解析状态。
            </p>
          </CardContent>
        </Card>
      )}

      {report.isPending && (
        <Card>
          <CardContent className="py-8">
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-sm bg-surface" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data && !report.isPending && (
        <Card>
          <CardHeader>
            <CardTitle>端点探测结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.endpoints.map((ep) => {
              const meta = STATE_META[ep.state];
              const isOpen = expanded === ep.endpoint;
              return (
                <div key={ep.endpoint} className="rounded-sm border border-border/50">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : ep.endpoint)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-elevated/50"
                  >
                    <StateIcon state={ep.state} />
                    <span className="min-w-0 flex-1 font-mono text-[13px] text-text-primary">{ep.endpoint}</span>
                    <Badge variant={meta.variant} className="w-16 justify-center">{meta.label}</Badge>
                    <span className="hidden w-40 truncate text-right text-xs text-text-tertiary sm:block">{ep.summary}</span>
                    <span className="w-14 text-right font-mono text-[11px] text-text-tertiary">
                      {ep.latencyMs === null ? "—" : `${ep.latencyMs}ms`}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 text-text-tertiary transition-transform duration-page", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-border/50 px-3 py-3">
                      <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                        <Detail label="HTTP Status" value={ep.httpStatus === null ? "—" : String(ep.httpStatus)} mono />
                        <Detail label="Latency" value={ep.latencyMs === null ? "—" : `${ep.latencyMs}ms`} mono />
                        <Detail label="Response Type" value={ep.responseType} mono />
                        <Detail label="Parser" value={ep.state === "parse-error" ? "Failed" : ep.state === "ok" || ep.state === "empty" ? "OK" : "n/a"} mono />
                        <Detail label="Result" value={ep.summary} />
                        {ep.parseDetail && <Detail label="Reason" value={ep.parseDetail} />}
                        {ep.errorMessage && <Detail label="Error" value={ep.errorMessage} />}
                      </div>
                      {ep.raw !== undefined && (
                        <div className="mt-3">
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                            Raw Structure
                            {ep.rawRecords !== undefined && (
                              <span className="ml-2 normal-case tracking-normal text-text-secondary">
                                {ep.rawRecords} records · preview first {Math.min(ep.rawRecords, 3)}
                              </span>
                            )}
                          </p>
                          <pre className="scrollbar-thin max-h-72 overflow-auto rounded-sm border border-border bg-surface/60 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
                            {JSON.stringify(ep.raw, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActivityIcon() {
  return <Inbox className="h-8 w-8 text-text-tertiary" />;
}

function StateIcon({ state }: { state: EndpointDiagnostic["state"] }) {
  switch (state) {
    case "ok":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
    case "empty":
      return <Inbox className="h-4 w-4 shrink-0 text-text-tertiary" />;
    case "parse-error":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />;
    case "unsupported":
      return <CloudOff className="h-4 w-4 shrink-0 text-warning" />;
    case "unauthorized":
      return <KeyRound className="h-4 w-4 shrink-0 text-danger" />;
    case "network-error":
      return <Ban className="h-4 w-4 shrink-0 text-danger" />;
    case "timeout":
      return <Clock className="h-4 w-4 shrink-0 text-warning" />;
    case "server-error":
      return <ServerOff className="h-4 w-4 shrink-0 text-danger" />;
    case "api-error":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />;
  }
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-text-tertiary">{label}</span>
      <span className={`min-w-0 truncate text-right text-text-primary ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
