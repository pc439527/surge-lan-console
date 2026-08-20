/**
 * Build identity (OPTIMIZATION_PLAN Task 01).
 *
 * The values below are injected at build time by Vite `define` from
 * vite.config.ts (git commit / branch / build time are derived from the
 * repository unless overridden by VITE_* env vars, e.g. Docker build args).
 *
 * Exposed to the UI so the running deployment can always be compared
 * against GitHub main (deployment-version verification, §82–88).
 */

declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __GIT_BRANCH__: string;
declare const __BUILD_TIME__: string;
declare const __APP_ENV__: string;

export interface BuildInfo {
  version: string;
  commit: string;
  branch: string;
  buildTime: string;
  environment: string;
}

export const BUILD_INFO: BuildInfo = {
  version: __APP_VERSION__ ?? "dev",
  commit: __GIT_COMMIT__ ?? "unknown",
  branch: __GIT_BRANCH__ ?? "unknown",
  buildTime: __BUILD_TIME__ ?? "",
  environment: __APP_ENV__ ?? "development",
};

/** Compact "v0.2.0 · da3065f" label for the sidebar footer. */
export function compactBuildLabel(): string {
  return `v${BUILD_INFO.version} · ${BUILD_INFO.commit}`;
}

/** Human-readable build time in the local timezone, or "—" when unknown. */
export function formatBuildTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}
