import { randomUUID } from "node:crypto";
import type { AppDatabase } from "./database.js";
import type { ConnectionService } from "./connection-service.js";
import {
  DNS_HIGH_LATENCY_MS,
  dnsHealthDomainFromConfig,
  parseDnsDelayMs,
} from "./dns-health.js";
import type { EventBus } from "./event-bus.js";
import { parseSurgeEvents } from "./event-collector.js";
import { CoreError } from "./errors.js";
import { parsePolicyNodeHealth } from "./policy-health.js";
import { ProfileHistoryService } from "./profile-history.js";
import { RetentionService } from "./retention-service.js";
import type { RuntimeVault } from "./runtime-vault.js";
import type { SurgeTransport, SurgeProxyResult } from "./surge-transport.js";
import { TrafficAnalyticsService } from "./traffic-analytics.js";

export type JobType = "device-heartbeat" | "metrics" | "events" | "dns-health" | "node-health" | "profile-snapshot" | "profile-reload" | "daily-digest";

interface JobRow {
  id: string;
  type: JobType;
  connection_id: string | null;
  enabled: number;
  interval_seconds: number;
  config_json: string;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CollectorStateRow {
  cursor_json: string;
}

export interface ScheduledJob {
  id: string;
  type: JobType;
  connectionId: string | null;
  enabled: boolean;
  intervalSeconds: number;
  nextRunAt: string;
  lastRunAt: string | null;
}

export interface JobRun {
  id: string;
  jobId: string;
  status: "success" | "error" | "skipped";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  message: string | null;
}

const DEFAULTS: Array<{ type: JobType; interval: number; enabled: boolean }> = [
  { type: "device-heartbeat", interval: 60, enabled: true },
  { type: "metrics", interval: 60, enabled: true },
  { type: "events", interval: 30, enabled: true },
  { type: "dns-health", interval: 600, enabled: true },
  { type: "node-health", interval: 1800, enabled: true },
  { type: "profile-snapshot", interval: 21_600, enabled: true },
  { type: "profile-reload", interval: 21_600, enabled: false },
];

const MIN_INTERVAL: Record<JobType, number> = {
  "device-heartbeat": 30,
  metrics: 30,
  events: 30,
  "dns-health": 60,
  "node-health": 60,
  "profile-snapshot": 900,
  "profile-reload": 300,
  "daily-digest": 3600,
};

const EVENT_CURSOR_LIMIT = 400;
const EVENT_WINDOW_LIMIT = 200;

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private readonly running = new Set<string>();
  private readonly retention: RetentionService;
  private readonly trafficAnalytics: TrafficAnalyticsService;
  private readonly profileHistory: ProfileHistoryService;
  private announcedUnlock = false;

  constructor(
    private readonly database: AppDatabase,
    private readonly connections: ConnectionService,
    private readonly surge: SurgeTransport,
    private readonly events: EventBus,
    private readonly runtimeVault: RuntimeVault,
  ) {
    this.retention = new RetentionService(database);
    this.trafficAnalytics = new TrafficAnalyticsService(database);
    this.profileHistory = new ProfileHistoryService(database);
  }

  start(): void {
    if (this.timer) return;
    this.ensureDefaultsForAll();
    this.ensureDailyDigest();
    this.retention.runIfDue();
    this.timer = setInterval(() => { void this.tick(); }, 1_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running.clear();
  }

  ensureDefaultsForAll(): void {
    for (const connection of this.connections.list()) this.ensureDefaults(connection.id);
  }

  ensureDefaults(connectionId: string): void {
    for (const item of DEFAULTS) this.ensureJob(item.type, connectionId, item.interval, item.enabled);
  }

  listJobs(): ScheduledJob[] {
    return this.database.queryAll<JobRow>(`SELECT * FROM scheduled_jobs ORDER BY connection_id, type`).map((row) => this.publicJob(row));
  }

  listRuns(limit = 100): JobRun[] {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    return this.database.queryAll<{
      id: string; job_id: string; status: "success" | "error" | "skipped"; started_at: string; finished_at: string; duration_ms: number; message: string | null;
    }>(`SELECT id, job_id, status, started_at, finished_at, duration_ms, message FROM job_runs ORDER BY created_at DESC LIMIT ?`, safeLimit)
      .map((row) => ({ id: row.id, jobId: row.job_id, status: row.status, startedAt: row.started_at, finishedAt: row.finished_at, durationMs: row.duration_ms, message: row.message }));
  }

  updateJob(id: string, input: { enabled?: boolean; intervalSeconds?: number }): ScheduledJob {
    const row = this.requireJob(id);
    const interval = input.intervalSeconds ?? row.interval_seconds;
    const minimum = MIN_INTERVAL[row.type];
    if (!Number.isInteger(interval) || interval < minimum || interval > 604_800) {
      throw new CoreError("invalid_job_interval", 400, `${row.type} 最小间隔为 ${minimum} 秒，最大为 7 天。`);
    }
    const enabled = input.enabled === undefined ? row.enabled : Number(input.enabled);
    this.database.execute(`
      UPDATE scheduled_jobs SET enabled = ?, interval_seconds = ?, next_run_at = ?, updated_at = ? WHERE id = ?
    `, enabled, interval, new Date(Date.now() + interval * 1000).toISOString(), new Date().toISOString(), id);
    return this.publicJob(this.requireJob(id));
  }

  async runNow(id: string): Promise<JobRun> {
    const job = this.requireJob(id);
    if (!this.runtimeVault.isUnlocked()) throw new CoreError("vault_locked", 423, "请先解锁数据密码，再执行自动任务。");
    return this.executeJob(job, true);
  }

  private async tick(): Promise<void> {
    this.retention.runIfDue();
    if (!this.runtimeVault.isUnlocked()) {
      this.announcedUnlock = false;
      return;
    }
    if (!this.announcedUnlock) {
      this.announcedUnlock = true;
      this.events.publish({ type: "engine-restart", fingerprint: "engine:runtime-unlocked", title: "Surge LAN Console Core 已就绪", body: "后台 Scheduler 与通知引擎已恢复运行。", severity: "info" });
    }
    const due = this.database.queryAll<JobRow>(`
      SELECT * FROM scheduled_jobs WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 20
    `, new Date().toISOString());
    await Promise.all(due.filter((job) => !this.running.has(job.id)).map((job) => this.executeJob(job, false).catch(() => undefined)));
  }

  private async executeJob(job: JobRow, manual: boolean): Promise<JobRun> {
    if (this.running.has(job.id)) throw new CoreError("job_running", 409, "任务正在运行中。");
    this.running.add(job.id);
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    let status: JobRun["status"] = "success";
    let message: string | null = manual ? "manual" : null;
    let run: JobRun;

    try {
      await this.perform(job);
      this.publishJobRecovery(job);
    } catch (error) {
      status = "error";
      message = error instanceof CoreError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : "unknown error";
      this.publishJobFailure(job, message);
    } finally {
      const finished = Date.now();
      const finishedAt = new Date(finished).toISOString();
      run = {
        id: `run-${randomUUID()}`, jobId: job.id, status, startedAt, finishedAt,
        durationMs: Math.max(0, finished - started), message,
      };
      this.database.transaction(() => {
        this.database.execute(`
          INSERT INTO job_runs(id, job_id, status, started_at, finished_at, duration_ms, message, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, run.id, run.jobId, run.status, run.startedAt, run.finishedAt, run.durationMs, run.message?.slice(0, 1000) ?? null, finishedAt);
        this.database.execute(`
          UPDATE scheduled_jobs SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?
        `, finishedAt, new Date(finished + job.interval_seconds * 1000).toISOString(), finishedAt, job.id);
      });
      this.running.delete(job.id);
    }
    if (status === "error" && manual) throw new CoreError("job_failed", 502, message ?? "任务执行失败。");
    return run;
  }

  private async perform(job: JobRow): Promise<void> {
    if (job.type === "daily-digest") { this.runDailyDigest(); return; }
    if (!job.connection_id) throw new CoreError("job_connection_missing", 409, "任务缺少连接。");
    const key = this.runtimeVault.getKey();
    try {
      const credentials = this.connections.getCredentials(job.connection_id, key);
      switch (job.type) {
        case "device-heartbeat": await this.runHeartbeat(job.connection_id, credentials); return;
        case "metrics": await this.collectMetrics(job.connection_id, credentials); return;
        case "events": await this.collectEvents(job.connection_id, credentials); return;
        case "dns-health": await this.runDnsHealth(job, credentials); return;
        case "node-health": await this.runNodeHealth(job.connection_id, credentials); return;
        case "profile-snapshot": await this.runProfileSnapshot(job.connection_id, credentials, "scheduled"); return;
        case "profile-reload": await this.runProfileReload(job.connection_id, credentials); return;
        default: throw new CoreError("unknown_job_type", 500, "未知自动任务类型。");
      }
    } finally {
      key.fill(0);
    }
  }

  private async runHeartbeat(connectionId: string, credentials: Parameters<SurgeTransport["request"]>[0]): Promise<void> {
    let result: SurgeProxyResult;
    try { result = await this.surge.request(credentials, "GET", "/v1/outbound", null, {}, 5_000); }
    catch (error) {
      this.events.publish({ type: "device-offline", fingerprint: `device:${connectionId}`, title: "Surge 设备离线", body: `${credentials.connection.name} 无法连接。`, severity: "error", connectionId });
      throw error;
    }
    if (result.statusCode === 401 || result.statusCode === 403) {
      this.events.publish({ type: "surge-authentication-error", fingerprint: `auth:${connectionId}`, title: "Surge API 认证失败", body: `${credentials.connection.name} 的 API Key 未通过认证。`, severity: "error", connectionId });
      throw new CoreError("surge_authentication_error", 502, "Surge API 认证失败。");
    }
    if (result.statusCode < 200 || result.statusCode >= 300) throw new CoreError("surge_health_failed", 502, `Surge 返回 HTTP ${result.statusCode}。`);
    this.events.publish({ type: "device-recovery", fingerprint: `device:${connectionId}`, title: "Surge 设备恢复", body: `${credentials.connection.name} 已恢复连接。`, severity: "info", recovery: true, connectionId });
  }

  private async runDnsHealth(job: JobRow, credentials: Parameters<SurgeTransport["request"]>[0]): Promise<void> {
    const connectionId = job.connection_id;
    if (!connectionId) throw new CoreError("job_connection_missing", 409, "DNS 健康检查缺少连接。");
    const domain = dnsHealthDomainFromConfig(job.config_json);

    try {
      const cache = await this.surge.request(credentials, "GET", "/v1/dns", null, {}, 5_000);
      if (cache.statusCode < 200 || cache.statusCode >= 300) {
        throw new CoreError("dns_http_error", 502, `DNS API 返回 HTTP ${cache.statusCode}。`);
      }
      this.storeSample(connectionId, "dns", cache.body);

      const requestBody = Buffer.from(JSON.stringify({ domain }));
      const result = await this.surge.request(
        credentials,
        "POST",
        "/v1/test/dns_delay",
        requestBody,
        { contentType: "application/json" },
        10_000,
      );
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new CoreError("dns_delay_http_error", 502, `DNS Delay API 返回 HTTP ${result.statusCode}。`);
      }

      const delayMs = parseDnsDelayMs(result.body);
      this.storeSample(
        connectionId,
        "dns-health",
        Buffer.from(JSON.stringify({
          domain,
          delayMs,
          apiLatencyMs: result.latencyMs,
          measuredAt: new Date().toISOString(),
        })),
      );

      if (delayMs > DNS_HIGH_LATENCY_MS) {
        this.events.publish({
          type: "dns-high-latency",
          fingerprint: `dns:${connectionId}`,
          title: "DNS 解析延迟过高",
          body: `${credentials.connection.name} · ${domain} · ${delayMs}ms`,
          severity: "warning",
          connectionId,
        });
      } else {
        this.events.publish({
          type: "dns-recovery",
          fingerprint: `dns:${connectionId}`,
          title: "DNS 状态恢复",
          body: `${credentials.connection.name} · ${domain} · ${delayMs}ms`,
          severity: "info",
          recovery: true,
          connectionId,
        });
      }
    } catch (error) {
      this.events.publish({
        type: "dns-failure",
        fingerprint: `dns:${connectionId}`,
        title: "DNS 检查失败",
        body: `${credentials.connection.name} · ${domain} 无法完成 DNS 延迟测试。`,
        severity: "error",
        connectionId,
      });
      throw error;
    }
  }

  private async runNodeHealth(connectionId: string, credentials: Parameters<SurgeTransport["request"]>[0]): Promise<void> {
    const result = await this.surge.request(credentials, "GET", "/v1/policy_groups/test_results", null, {}, 10_000);
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new CoreError("policy_health_error", 502, `策略节点测试结果 API 返回 HTTP ${result.statusCode}。`);
    }

    this.storeSample(connectionId, "node-quality", result.body);
    const nodes = parsePolicyNodeHealth(result.body);
    for (const node of nodes) {
      const fingerprint = `policy-node:${connectionId}:${node.key}`;
      const memberships = node.groups.length > 0 ? ` · ${node.groups.join(" / ")}` : "";
      if (node.reachable) {
        const latency = node.latencyMs === null ? "" : ` · ${Math.round(node.latencyMs)}ms`;
        this.events.publish({
          type: "policy-node-recovery",
          fingerprint,
          title: "策略节点恢复",
          body: `${credentials.connection.name} · ${node.name}${latency}${memberships}`,
          severity: "info",
          recovery: true,
          connectionId,
        });
      } else {
        this.events.publish({
          type: "policy-node-unreachable",
          fingerprint,
          title: "策略节点不可达",
          body: `${credentials.connection.name} · ${node.name}${memberships}`,
          severity: "warning",
          connectionId,
        });
      }
    }
  }

  private async runProfileSnapshot(
    connectionId: string,
    credentials: Parameters<SurgeTransport["request"]>[0],
    source: "scheduled" | "reload",
  ): Promise<void> {
    const result = await this.surge.request(credentials, "GET", "/v1/profiles/current?sensitive=0", null, {}, 10_000);
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new CoreError("profile_snapshot_http_error", 502, `配置快照读取返回 HTTP ${result.statusCode}。`);
    }
    this.profileHistory.capture(connectionId, result.body, source);
  }

  private async runProfileReload(connectionId: string, credentials: Parameters<SurgeTransport["request"]>[0]): Promise<void> {
    try {
      const result = await this.surge.request(credentials, "POST", "/v1/profiles/reload", Buffer.from("{}"), { contentType: "application/json" }, 15_000);
      if (result.statusCode < 200 || result.statusCode >= 300) throw new CoreError("profile_reload_error", 502, `Profile Reload 返回 HTTP ${result.statusCode}。`);
      try { await this.runProfileSnapshot(connectionId, credentials, "reload"); } catch { /* Reload success is independent of snapshot availability. */ }
      this.events.publish({ type: "profile-reload-success", fingerprint: `profile:${connectionId}`, title: "配置重新加载成功", body: `${credentials.connection.name} 已完成 Profile Reload。`, severity: "info", connectionId });
    } catch (error) {
      this.events.publish({ type: "profile-reload-failure", fingerprint: `profile:${connectionId}`, title: "配置重新加载失败", body: `${credentials.connection.name} Profile Reload 执行失败。`, severity: "error", connectionId });
      throw error;
    }
  }

  private async collectMetrics(connectionId: string, credentials: Parameters<SurgeTransport["request"]>[0]): Promise<void> {
    const result = await this.surge.request(credentials, "GET", "/v1/traffic");
    if (result.statusCode < 200 || result.statusCode >= 300) throw new CoreError("collector_http_error", 502, `metrics Collector 返回 HTTP ${result.statusCode}。`);
    const sampledAt = Date.now();
    this.storeSample(connectionId, "metrics", result.body, sampledAt);
    this.trafficAnalytics.ingest(connectionId, result.body, sampledAt);
  }

  private async collectEvents(connectionId: string, credentials: Parameters<SurgeTransport["request"]>[0]): Promise<void> {
    const result = await this.surge.request(credentials, "GET", "/v1/events");
    if (result.statusCode < 200 || result.statusCode >= 300) throw new CoreError("events_http_error", 502, `Events API 返回 HTTP ${result.statusCode}。`);

    const recent = parseSurgeEvents(result.body).slice(-EVENT_WINDOW_LIMIT);
    const previousCursor = this.loadEventCursor(connectionId);
    const currentKeys = recent.map((event) => event.key);

    if (previousCursor === null) {
      this.saveEventCursor(connectionId, currentKeys);
      return;
    }

    const seen = new Set(previousCursor);
    const unseen = recent.filter((event) => !seen.has(event.key));
    if (unseen.length > 0) {
      this.storeSample(
        connectionId,
        "events",
        Buffer.from(JSON.stringify({
          events: unseen.map((event) => ({
            identifier: event.identifier,
            date: event.date,
            type: event.type,
            content: event.content,
          })),
        })),
      );

      for (const event of unseen) {
        if (!event.severity) continue;
        const type = event.severity === "error" ? "event-error" : "event-warning";
        const title = event.severity === "error" ? "Surge 错误事件" : "Surge 警告事件";
        this.events.publish({
          type,
          fingerprint: `${type}:${connectionId}:${event.content.slice(0, 120)}`,
          title,
          body: event.content.slice(0, 800),
          severity: event.severity,
          connectionId,
        });
      }
    }

    const nextCursor = [...new Set([...previousCursor, ...currentKeys])].slice(-EVENT_CURSOR_LIMIT);
    this.saveEventCursor(connectionId, nextCursor);
  }

  private loadEventCursor(connectionId: string): string[] | null {
    const state = this.database.queryOne<CollectorStateRow>(`
      SELECT cursor_json FROM collector_state WHERE connection_id = ? AND collector = 'events'
    `, connectionId);
    if (!state) return null;
    try {
      const parsed = JSON.parse(state.cursor_json) as unknown;
      return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
    } catch {
      return [];
    }
  }

  private saveEventCursor(connectionId: string, keys: string[]): void {
    this.database.execute(`
      INSERT INTO collector_state(connection_id, collector, cursor_json, updated_at)
      VALUES (?, 'events', ?, ?)
      ON CONFLICT(connection_id, collector) DO UPDATE SET
        cursor_json = excluded.cursor_json,
        updated_at = excluded.updated_at
    `, connectionId, JSON.stringify(keys.slice(-EVENT_CURSOR_LIMIT)), new Date().toISOString());
  }

  private storeSample(connectionId: string, kind: string, body: Buffer, sampledAtMs = Date.now()): void {
    const text = body.toString("utf8");
    this.database.execute(`
      INSERT INTO collector_samples(id, connection_id, kind, value_json, sampled_at) VALUES (?, ?, ?, ?, ?)
    `, `sample-${randomUUID()}`, connectionId, kind, text.slice(0, 2_000_000), new Date(sampledAtMs).toISOString());
  }

  private runDailyDigest(): void {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const total = this.database.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM job_runs WHERE created_at >= ?", since)?.count ?? 0;
    const failed = this.database.queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM job_runs WHERE created_at >= ? AND status = 'error'", since)?.count ?? 0;
    this.events.publish({ type: "daily-digest", fingerprint: `digest:${new Date().toISOString().slice(0, 10)}`, title: "Surge LAN Console Daily Digest", body: `过去 24 小时执行 ${total} 个后台任务，失败 ${failed} 个。`, severity: failed > 0 ? "warning" : "info" });
  }

  private publishJobFailure(job: JobRow, message: string): void {
    this.events.publish({ type: "scheduled-job-failure", fingerprint: `job:${job.id}`, title: "后台任务执行失败", body: `${job.type}: ${message.slice(0, 500)}`, severity: "error", connectionId: job.connection_id });
  }

  private publishJobRecovery(job: JobRow): void {
    this.events.publish({ type: "scheduled-job-recovery", fingerprint: `job:${job.id}`, title: "后台任务已恢复", body: `${job.type} 已恢复正常执行。`, severity: "info", recovery: true, connectionId: job.connection_id });
  }

  private ensureDailyDigest(): void { this.ensureJob("daily-digest", null, 86_400, false); }

  private ensureJob(type: JobType, connectionId: string | null, interval: number, enabled: boolean): void {
    const existing = this.database.queryOne<{ id: string }>(`
      SELECT id FROM scheduled_jobs WHERE type = ? AND connection_id IS ? LIMIT 1
    `, type, connectionId);
    if (existing) return;
    const now = new Date();
    this.database.execute(`
      INSERT INTO scheduled_jobs(id, type, connection_id, enabled, interval_seconds, config_json, next_run_at, last_run_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, '{}', ?, NULL, ?, ?)
    `, `job-${randomUUID()}`, type, connectionId, Number(enabled), interval, new Date(now.getTime() + Math.min(interval, 15) * 1000).toISOString(), now.toISOString(), now.toISOString());
  }

  private requireJob(id: string): JobRow {
    const row = this.database.queryOne<JobRow>("SELECT * FROM scheduled_jobs WHERE id = ?", id);
    if (!row) throw new CoreError("job_not_found", 404, "自动任务不存在。");
    return row;
  }

  private publicJob(row: JobRow): ScheduledJob {
    return { id: row.id, type: row.type, connectionId: row.connection_id, enabled: Boolean(row.enabled), intervalSeconds: row.interval_seconds, nextRunAt: row.next_run_at, lastRunAt: row.last_run_at };
  }
}
