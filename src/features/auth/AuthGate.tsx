import { useState, type FormEvent, type ReactNode } from "react";
import { Database, LoaderCircle, LockKeyhole, ServerOff, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { coreApi, CoreApiError, type CoreAuthState } from "@/lib/core-api";

const AUTH_STATE_KEY = ["core", "auth-state"] as const;
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
  // the Local Core data-password gate remains mandatory for real usage.
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
            数据密码、SQLite 与后续自动任务由本地 Core 提供。为避免绕过数据保护，Core 不可用时控制台不会进入主界面。
          </p>
          <Button className="mt-6" onClick={onRetry}>重新连接</Button>
          <p className="mt-4 font-mono text-xs text-text-tertiary">开发环境：pnpm core:dev</p>
        </CardContent>
      </Card>
    </GateFrame>
  );
}

function PasswordScreen({
  initialized,
  onAuthenticated,
}: {
  initialized: boolean;
  onAuthenticated: (state: CoreAuthState) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => initialized ? coreApi.unlock(password) : coreApi.setup(password, confirmPassword),
    onSuccess: onAuthenticated,
  });

  const errorMessage = mutation.error instanceof CoreApiError
    ? mutation.error.message
    : mutation.isError
      ? "操作失败，请重试。"
      : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    mutation.mutate();
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
          {initialized ? "输入数据密码以解锁本地控制台" : "首次使用：创建本地数据保护密码"}
        </p>
      </div>

      <Card className="content-panel">
        <CardContent className="p-6 sm:p-7">
          <form className="space-y-4" onSubmit={submit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-text-primary">数据密码</span>
              <Input
                autoFocus
                type="password"
                autoComplete={initialized ? "current-password" : "new-password"}
                minLength={8}
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 8 个字符"
                className="h-11"
                aria-describedby="data-password-hint"
              />
            </label>

            {!initialized && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-text-primary">确认密码</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={256}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入数据密码"
                  className="h-11"
                />
              </label>
            )}

            {errorMessage && (
              <div role="alert" className="rounded-sm border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                {errorMessage}
              </div>
            )}

            <Button type="submit" className="h-10 w-full justify-center" disabled={mutation.isPending}>
              {mutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {initialized ? "解锁" : "创建并进入"}
            </Button>
          </form>

          <div id="data-password-hint" className="mt-5 flex gap-2.5 border-t border-border/60 pt-4 text-xs leading-5 text-text-tertiary">
            <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>密码不会以明文保存。它仅用于解锁本地 SQLite 中的加密数据；关闭 Core 后当前解锁 Session 自动失效。</p>
          </div>
        </CardContent>
      </Card>
    </GateFrame>
  );
}
