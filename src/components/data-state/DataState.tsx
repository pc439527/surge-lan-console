import type { ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  CloudOff,
  Inbox,
  KeyRound,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { SurgeError } from "@/api/errors";

/**
 * Common data states (OPTIMIZATION_PLAN Task 03, §15 / §26 / §43–45).
 *
 * Every feature must be able to distinguish:
 *   loading · empty · error · unsupported · unauthorized
 * so "API failed" is never shown as "no data" and "platform does not
 * support this endpoint" is never shown as an app bug.
 */

export interface DataStateProps {
  /** Compact height for card-internal states (default: full card). */
  compact?: boolean;
  className?: string;
}

function pad(className?: string, compact?: boolean) {
  return className ?? (compact ? "py-6" : "py-14");
}

// ── Loading ───────────────────────────────────────────────────

export function DataLoading({ rows = 3, compact }: { rows?: number } & DataStateProps) {
  return (
    <div className={`space-y-2 ${pad(undefined, compact)}`} aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

// ── Empty ─────────────────────────────────────────────────────

export function DataEmpty({
  title,
  description,
  icon,
  compact,
  className,
}: DataStateProps & { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${pad(className, compact)}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface text-text-tertiary">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {description && <p className="max-w-sm text-xs text-text-tertiary">{description}</p>}
    </div>
  );
}

// ── Error / Unsupported / Unauthorized ────────────────────────

export function DataError({
  title = "无法读取数据",
  api,
  error,
  onRetry,
  compact,
  className,
}: DataStateProps & { title?: string; api?: string; error?: unknown; onRetry?: () => void }) {
  const friendly = error instanceof SurgeError ? error.message : "发生未知 API 错误。";
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${pad(className, compact)}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-pill bg-danger/10 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      {api && <p className="font-mono text-xs text-text-tertiary">API: {api}</p>}
      <p className="max-w-sm text-xs text-text-secondary">{friendly}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" className="mt-1" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          重新加载
        </Button>
      )}
    </div>
  );
}

export function DataUnsupported({
  title = "当前 Surge 平台不支持该接口",
  description,
  compact,
  className,
}: DataStateProps & { title?: string; description?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${pad(className, compact)}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface text-text-tertiary">
        <CloudOff className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="max-w-sm text-xs text-text-tertiary">
        {description ??
          "当前 Surge 平台未开放该接口（HTTP 404/405）。响应结构无法识别的问题请查看「设置 → API Diagnostics」。"}
      </p>
    </div>
  );
}

export function DataUnauthorized({
  title = "API 密钥无效或未获授权",
  description,
  compact,
  className,
}: DataStateProps & { title?: string; description?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${pad(className, compact)}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-pill bg-warning/15 text-warning">
        <KeyRound className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="max-w-sm text-xs text-text-tertiary">
        {description ?? "请到「连接」中检查 API 密钥。"}
      </p>
    </div>
  );
}

// ── Network / connection-level error ──────────────────────────

export function DataNetworkError({
  title = "无法连接到 Surge",
  error,
  onRetry,
  compact,
  className,
}: DataStateProps & { title?: string; error?: unknown; onRetry?: () => void }) {
  const friendly = error instanceof SurgeError ? error.message : "请检查设备可达性与端口。";
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${pad(className, compact)}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-pill bg-surface text-text-tertiary">
        <Ban className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="max-w-sm text-xs text-text-secondary">{friendly}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" className="mt-1" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          重试
        </Button>
      )}
    </div>
  );
}

// ── Busy action (mutation in flight) ──────────────────────────

export function DataPending({ label = "处理中…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-xs text-text-tertiary">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

/** Map a SurgeError to its dedicated data-state component. */
export function ErrorStateView({ error, api, onRetry, compact }: { error: unknown; api?: string; onRetry?: () => void; compact?: boolean }) {
  if (error instanceof SurgeError) {
    switch (error.kind) {
      case "authentication":
        return <DataUnauthorized compact={compact} />;
      case "unsupported":
        return <DataUnsupported compact={compact} />;
      case "parse-error":
        return (
          <DataError
            compact={compact}
            api={api}
            error={error}
            onRetry={onRetry}
            title="API 可访问，但返回结构无法识别"
          />
        );
      case "connection":
      case "timeout":
      case "browser-security":
        return <DataNetworkError compact={compact} error={error} onRetry={onRetry} />;
      case "server-error":
        return (
          <DataError
            compact={compact}
            api={api}
            error={error}
            onRetry={onRetry}
            title="Surge API 服务暂时不可用"
          />
        );
      case "api":
        return <DataError compact={compact} api={api} error={error} onRetry={onRetry} />;
    }
  }
  return <DataError compact={compact} api={api} error={error} onRetry={onRetry} />;
}
