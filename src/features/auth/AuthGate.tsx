import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ChevronLeft, Database, LoaderCircle, LockKeyhole, ServerOff, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { coreApi, CoreApiError, type CoreAuthState } from "@/lib/core-api";

const AUTH_STATE_KEY = ["core", "auth-state"] as const;
const PIN_LENGTH = 4;
const visualMode = import.meta.env.MODE === "visual";

export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const authQuery = useQuery({
    queryKey: AUTH_STATE_KEY,
    queryFn: coreApi.getAuthState,
    retry: 1,
    refetchOnWindowFocus: true,
    enabled: !visualMode,
  });

  // Visual CI is a compile-time-only mode used to render the application shell
  // against MockSurgeClient. Production/dev builds never take this branch, so
  // the Local Core data-PIN gate remains mandatory for real usage.
  if (visualMode) return children;

  if (authQuery.isLoading) return <GateLoading />;
  if (authQuery.isError || !authQuery.data) {
    return <CoreUnavailable onRetry={() => void authQuery.refetch()} />;
  }
  if (authQuery.data.authenticated) return children;

  return (
    <PasswordScreen
      initialized={authQuery.data.initialized}
      onAuthenticated={(state) => queryClient.setQueryData(AUTH_STATE_KEY, state)}
    />
  );
}

function GateFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[430px]">{children}</div>
    </div>
  );
}

function GateLoading() {
  return (
    <GateFrame>
      <div className="flex flex-col items-center gap-3 text-center text-text-secondary">
        <LoaderCircle className="h-6 w-6 animate-spin text-accent" aria-hidden="true" />
        <p className="text-sm">正在连接本地 Core…</p>
      </div>
    </GateFrame>
  );
}

function CoreUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <GateFrame>
      <Card className="content-panel">
        <CardContent className="flex flex-col items-center px-6 py-8 text-center sm:px-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-md bg-surface-tertiary text-danger">
            <ServerOff className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-text-primary">Local Core 未连接</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
            数据 PIN、SQLite 与后续自动任务由本地 Core 提供。为避免绕过数据保护，Core 不可用时控制台不会进入主界面。
          </p>
          <Button className="mt-6" onClick={onRetry}>重新连接</Button>
          <p className="mt-4 font-mono text-xs text-text-tertiary">开发环境：pnpm core:dev</p>
        </CardContent>
      </Card>
    </GateFrame>
  );
}

type PinStage = "create" | "confirm";

function PasswordScreen({
  initialized,
  onAuthenticated,
}: {
  initialized: boolean;
  onAuthenticated: (state: CoreAuthState) => void;
}) {
  const [pin, setPin] = useState("");
  const [stage, setStage] = useState<PinStage>("create");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const firstPin = useRef("");

  const mutation = useMutation({
    mutationFn: (value: string) => (initialized ? coreApi.unlock(value) : coreApi.setup(value, value)),
    onSuccess: onAuthenticated,
    onError: (mutationError) => {
      const message = mutationError instanceof CoreApiError ? mutationError.message : "操作失败，请重试。";
      const wrongPin = mutationError instanceof CoreApiError && mutationError.code === "invalid_password";
      setError(message);
      setPin("");
      if (wrongPin) setShakeKey((key) => key + 1);
    },
  });

  function failWith(message: string, shake = false): void {
    setError(message);
    setPin("");
    if (shake) setShakeKey((key) => key + 1);
  }

  /** 每输入一位都经过这里；凑满 4 位后自动进入下一步或提交。 */
  function handlePinChange(next: string): void {
    if (next === pin) return;
    setPin(next);
    if (error) setError(null);
    if (next.length < PIN_LENGTH) return;

    if (initialized) {
      mutation.mutate(next);
      return;
    }
    if (stage === "create") {
      firstPin.current = next;
      setPin("");
      setStage("confirm");
      return;
    }
    if (next !== firstPin.current) {
      firstPin.current = "";
      failWith("两次输入的 PIN 不一致，请重新设置。", true);
      setStage("create");
      return;
    }
    mutation.mutate(next);
  }

  function backToCreate(): void {
    setStage("create");
    setPin("");
    setError(null);
  }

  return (
    <GateFrame>
      <div className="mb-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-surface-primary shadow-sm">
          {initialized
            ? <LockKeyhole className="h-6 w-6 text-accent" aria-hidden="true" />
            : <ShieldCheck className="h-6 w-6 text-accent" aria-hidden="true" />}
        </div>
        <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-text-primary">Surge LAN Console</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {initialized ? "输入 4 位数字 PIN 解锁本地控制台" : "首次使用：设置你的 4 位数字 PIN"}
        </p>
      </div>

      <Card className="content-panel">
        <CardContent className="p-6 sm:p-7">
          {!initialized && (
            <div className="mb-5 space-y-3">
              <div className="flex items-center justify-center gap-1.5" role="group" aria-label="设置步骤">
                <StepPill active={stage === "create"}>创建</StepPill>
                <StepPill active={stage === "confirm"}>确认</StepPill>
              </div>
              <p className="text-center text-sm text-text-secondary">
                {stage === "create" ? "输入 4 位数字，作为解锁 PIN" : "再次输入相同的 4 位数字以确认"}
              </p>
            </div>
          )}

          <div key={`${stage}-${shakeKey}`} className={cn(shakeKey > 0 && "animate-pin-shake")}>
            <PinInput
              value={pin}
              onChange={handlePinChange}
              disabled={mutation.isPending}
              error={Boolean(error)}
              autoFocus
            />
          </div>

          <div className="mt-4 flex min-h-5 items-center justify-center">
            {error ? (
              <div role="alert" className="w-full rounded-sm border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                {error}
              </div>
            ) : mutation.isPending ? (
              <p className="flex items-center gap-2 text-sm text-text-secondary">
                <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
                {initialized ? "正在解锁…" : "正在创建…"}
              </p>
            ) : null}
          </div>

          {!initialized && stage === "confirm" && (
            <div className="mt-3 flex justify-center">
              <Button type="button" variant="ghost" size="sm" onClick={backToCreate}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                重新输入
              </Button>
            </div>
          )}

          <div id="data-pin-hint" className="mt-5 flex gap-2.5 border-t border-border/60 pt-4 text-xs leading-5 text-text-tertiary">
            <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              PIN 仅用于解锁本地 SQLite 中的加密数据，不会以明文保存；关闭 Core 后当前解锁 Session 自动失效。
              {!initialized && " 避免使用 0000、1234 等易猜组合。"}
            </p>
          </div>
        </CardContent>
      </Card>
    </GateFrame>
  );
}

function StepPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-button ease-apple",
        active
          ? "border-accent/30 bg-accent/10 text-accent"
          : "border-border bg-surface text-text-tertiary",
      )}
    >
      {children}
    </span>
  );
}

function PinInput({
  value,
  onChange,
  disabled = false,
  error = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (next !== value) onChange(next);
  }

  return (
    <div className={cn("relative", disabled && "cursor-not-allowed")}>
      {/* 视觉上的 4 格 PIN 槽 */}
      <div aria-hidden="true" className="flex items-center justify-center gap-3">
        {Array.from({ length: PIN_LENGTH }, (_, index) => {
          const filled = index < value.length;
          const active = index === value.length && !disabled;
          return (
            <div
              key={index}
              className={cn(
                "flex h-14 w-12 items-center justify-center rounded-sm border bg-surface",
                "transition-all duration-button ease-apple",
                filled ? "border-accent/70 bg-accent/10" : "border-border",
                active && !error && "border-accent/70 ring-2 ring-accent/25",
                error && "border-danger/70 ring-2 ring-danger/25",
                disabled && "opacity-60",
              )}
            >
              {filled && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
            </div>
          );
        })}
      </div>
      {/* 真实输入：覆盖整个区域，移动端弹出数字键盘，桌面直接键盘输入 */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={PIN_LENGTH}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        onChange={handleChange}
        aria-label="4 位数字 PIN"
        aria-invalid={error}
        aria-describedby="data-pin-hint"
        className="absolute inset-0 h-full w-full cursor-text rounded-sm opacity-0 focus:outline-none"
      />
    </div>
  );
}
