import path from "node:path";

export interface CoreConfig {
  host: string;
  port: number;
  databasePath: string;
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const dataDir = env.SLC_DATA_DIR ?? path.resolve(process.cwd(), "data");
  return {
    host: env.SLC_HOST ?? "0.0.0.0",
    port: positiveInt(env.SLC_PORT, 8787),
    databasePath: env.SLC_DATABASE_PATH ?? path.join(dataDir, "surge-console.db"),
    sessionIdleMs: positiveInt(env.SLC_SESSION_IDLE_MINUTES, 30) * 60_000,
    sessionAbsoluteMs: positiveInt(env.SLC_SESSION_ABSOLUTE_HOURS, 12) * 60 * 60_000,
  };
}
