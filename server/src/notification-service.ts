import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { AppDatabase } from "./database.js";
import type { ConsoleEvent, ConsoleEventType, EventBus } from "./event-bus.js";
import { CoreError } from "./errors.js";
import type { RuntimeVault } from "./runtime-vault.js";
import type { SecretVault } from "./secret-vault.js";

const EVENT_TYPES: ConsoleEventType[] = [
  "device-offline", "device-recovery", "surge-authentication-error",
  "dns-failure", "dns-high-latency", "dns-recovery",
  "policy-node-unreachable", "policy-node-recovery",
  "event-warning", "event-error",
  "profile-reload-success", "profile-reload-failure",
  "scheduled-job-failure", "scheduled-job-recovery",
  "engine-restart", "unauthorized-ban", "daily-digest",
];

interface ChannelRow {
  id: string;
  provider: "bark";
  name: string;
  enabled: number;
  secret_id: string | null;
  created_at: string;
  updated_at: string;
}

interface RuleRow {
  id: string;
  channel_id: string;
  event_type: ConsoleEventType;
  enabled: number;
  cooldown_seconds: number;
  quiet_start: string | null;
  quiet_end: string | null;
  time_zone: string;
  created_at: string;
  updated_at: string;
}

interface EventStateRow {
  active: number;
  last_sent_at: string | null;
}

export interface NotificationChannel {
  id: string;
  provider: "bark";
  name: string;
  enabled: boolean;
  configured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRule {
  id: string;
  channelId: string;
  eventType: ConsoleEventType;
  enabled: boolean;
  cooldownSeconds: number;
  quietStart: string | null;
  quietEnd: string | null;
  timeZone: string;
  updatedAt: string;
}

export interface NotificationHistoryItem {
  id: string;
  channelId: string | null;
  eventType: string;
  fingerprint: string;
  title: string;
  body: string;
  status: "sent" | "error" | "suppressed";
  errorMessage: string | null;
  createdAt: string;
}

export class NotificationService {
  private readonly unsubscribe: () => void;

  constructor(
    private readonly database: AppDatabase,
    private readonly vault: SecretVault,
    private readonly runtimeVault: RuntimeVault,
    eventBus: EventBus,
  ) {
    this.unsubscribe = eventBus.subscribe((event) => { void this.handleEvent(event); });
  }

  close(): void { this.unsubscribe(); }

  listChannels(): NotificationChannel[] {
    return this.database.queryAll<ChannelRow>(`
      SELECT id, provider, name, enabled, secret_id, created_at, updated_at
      FROM notification_channels ORDER BY created_at ASC
    `).map((row) => this.publicChannel(row));
  }

  saveChannel(input: { id?: string; name: string; endpoint?: string; enabled?: boolean }, vaultKey: Buffer): NotificationChannel {
    const name = input.name.trim();
    if (!name || name.length > 80) throw new CoreError("invalid_channel", 400, "通知渠道名称不能为空且不能超过 80 个字符。");
    const existing = input.id ? this.findChannel(input.id) : null;
    const id = existing?.id ?? `notify-${randomUUID()}`;
    const secretId = existing?.secret_id ?? `notification:${id}:bark-endpoint`;
    const endpoint = input.endpoint?.trim();
    if (!existing && !endpoint) throw new CoreError("bark_endpoint_required", 400, "请填写 Bark Token 地址。");
    if (endpoint) this.validateBarkEndpoint(endpoint);
    const now = new Date().toISOString();

    this.database.transaction(() => {
      if (endpoint) this.vault.put(secretId, "bark-endpoint", endpoint, vaultKey);
      if (existing) {
        this.database.execute(`
          UPDATE notification_channels SET name = ?, enabled = ?, secret_id = ?, updated_at = ? WHERE id = ?
        `, name, input.enabled === undefined ? existing.enabled : Number(input.enabled), secretId, now, id);
      } else {
        this.database.execute(`
          INSERT INTO notification_channels(id, provider, name, enabled, secret_id, created_at, updated_at)
          VALUES (?, 'bark', ?, ?, ?, ?, ?)
        `, id, name, input.enabled === false ? 0 : 1, secretId, now, now);
        for (const eventType of EVENT_TYPES) {
          this.database.execute(`
            INSERT INTO notification_rules(id, channel_id, event_type, enabled, cooldown_seconds, quiet_start, quiet_end, time_zone, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, NULL, NULL, 'Asia/Shanghai', ?, ?)
          `, `rule-${randomUUID()}`, id, eventType, this.defaultCooldown(eventType), now, now);
        }
      }
    });
    return this.requireChannel(id);
  }

  deleteChannel(id: string): void {
    const row = this.requireChannelRow(id);
    this.database.transaction(() => {
      this.database.execute("DELETE FROM notification_channels WHERE id = ?", id);
      if (row.secret_id) this.vault.delete(row.secret_id);
    });
  }

  listRules(channelId?: string): NotificationRule[] {
    const rows = channelId
      ? this.database.queryAll<RuleRow>(`SELECT * FROM notification_rules WHERE channel_id = ? ORDER BY event_type`, channelId)
      : this.database.queryAll<RuleRow>(`SELECT * FROM notification_rules ORDER BY channel_id, event_type`);
    return rows.map((row) => ({
      id: row.id,
      channelId: row.channel_id,
      eventType: row.event_type,
      enabled: Boolean(row.enabled),
      cooldownSeconds: row.cooldown_seconds,
      quietStart: row.quiet_start,
      quietEnd: row.quiet_end,
      timeZone: row.time_zone,
      updatedAt: row.updated_at,
    }));
  }

  updateRule(id: string, input: { enabled?: boolean; cooldownSeconds?: number; quietStart?: string | null; quietEnd?: string | null; timeZone?: string }): NotificationRule {
    const row = this.database.queryOne<RuleRow>("SELECT * FROM notification_rules WHERE id = ?", id);
    if (!row) throw new CoreError("rule_not_found", 404, "通知规则不存在。");
    const cooldown = input.cooldownSeconds ?? row.cooldown_seconds;
    if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 86_400) throw new CoreError("invalid_rule", 400, "Cooldown 必须在 0-86400 秒之间。");
    const quietStart = input.quietStart === undefined ? row.quiet_start : this.validateClock(input.quietStart);
    const quietEnd = input.quietEnd === undefined ? row.quiet_end : this.validateClock(input.quietEnd);
    const timeZone = input.timeZone?.trim() || row.time_zone;
    this.validateTimeZone(timeZone);
    this.database.execute(`
      UPDATE notification_rules
      SET enabled = ?, cooldown_seconds = ?, quiet_start = ?, quiet_end = ?, time_zone = ?, updated_at = ?
      WHERE id = ?
    `, input.enabled === undefined ? row.enabled : Number(input.enabled), cooldown, quietStart, quietEnd, timeZone, new Date().toISOString(), id);
    return this.listRules().find((rule) => rule.id === id) as NotificationRule;
  }

  listHistory(limit = 100): NotificationHistoryItem[] {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    return this.database.queryAll<{
      id: string; channel_id: string | null; event_type: string; fingerprint: string; title: string; body: string;
      status: "sent" | "error" | "suppressed"; error_message: string | null; created_at: string;
    }>(`
      SELECT id, channel_id, event_type, fingerprint, title, body, status, error_message, created_at
      FROM notification_history ORDER BY created_at DESC LIMIT ?
    `, safeLimit).map((row) => ({
      id: row.id, channelId: row.channel_id, eventType: row.event_type, fingerprint: row.fingerprint,
      title: row.title, body: row.body, status: row.status, errorMessage: row.error_message, createdAt: row.created_at,
    }));
  }

  async testChannel(id: string, vaultKey: Buffer): Promise<void> {
    const row = this.requireChannelRow(id);
    if (!row.secret_id) throw new CoreError("channel_not_configured", 409, "Bark 渠道尚未配置 Token 地址。");
    const endpoint = this.vault.read(row.secret_id, "bark-endpoint", vaultKey);
    await this.sendBark(endpoint, "Surge LAN Console", "Bark 通知测试成功");
    this.recordHistory(id, "test", `test:${id}`, "Surge LAN Console", "Bark 通知测试成功", "sent", null);
  }

  private async handleEvent(event: ConsoleEvent): Promise<void> {
    if (!this.runtimeVault.isUnlocked()) return;
    const channels = this.database.queryAll<ChannelRow>(`
      SELECT id, provider, name, enabled, secret_id, created_at, updated_at FROM notification_channels WHERE enabled = 1
    `);
    for (const channel of channels) {
      const rule = this.database.queryOne<RuleRow>(`
        SELECT * FROM notification_rules WHERE channel_id = ? AND event_type = ? AND enabled = 1
      `, channel.id, event.type);
      if (!rule || !channel.secret_id) continue;
      await this.dispatch(channel, rule, event);
    }
  }

  private async dispatch(channel: ChannelRow, rule: RuleRow, event: ConsoleEvent): Promise<void> {
    if (!channel.secret_id) return;
    const state = this.database.queryOne<EventStateRow>(`
      SELECT active, last_sent_at FROM event_states WHERE channel_id = ? AND fingerprint = ?
    `, channel.id, event.fingerprint);

    if (event.recovery && !state?.active) return;
    if (!event.recovery && state?.active && state.last_sent_at) {
      const elapsed = Date.now() - new Date(state.last_sent_at).getTime();
      if (elapsed < rule.cooldown_seconds * 1000) {
        this.recordHistory(channel.id, event.type, event.fingerprint, event.title, event.body, "suppressed", "cooldown");
        return;
      }
    }
    if (this.inQuietHours(rule)) {
      this.setEventState(channel.id, event.fingerprint, event.recovery ? false : true, state?.last_sent_at ?? null);
      this.recordHistory(channel.id, event.type, event.fingerprint, event.title, event.body, "suppressed", "quiet-hours");
      return;
    }

    const key = this.runtimeVault.getKey();
    try {
      const endpoint = this.vault.read(channel.secret_id, "bark-endpoint", key);
      await this.sendBark(endpoint, event.title, event.body);
      const sentAt = new Date().toISOString();
      this.setEventState(channel.id, event.fingerprint, !event.recovery, sentAt);
      this.recordHistory(channel.id, event.type, event.fingerprint, event.title, event.body, "sent", null);
    } catch (error) {
      const message = error instanceof CoreError ? error.message : "Bark 推送失败";
      this.recordHistory(channel.id, event.type, event.fingerprint, event.title, event.body, "error", message);
    } finally {
      key.fill(0);
    }
  }

  private async sendBark(endpoint: string, title: string, body: string): Promise<void> {
    const target = new URL(endpoint);
    target.pathname = `${target.pathname.replace(/\/$/, "")}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
    const requestFn = target.protocol === "https:" ? httpsRequest : httpRequest;
    await new Promise<void>((resolve, reject) => {
      const request = requestFn(target, { method: "GET", headers: { Accept: "application/json" } }, (response) => {
        response.resume();
        response.on("end", () => {
          const status = response.statusCode ?? 500;
          if (status >= 200 && status < 300) resolve();
          else reject(new CoreError("bark_failed", 502, `Bark 服务返回 HTTP ${status}。`));
        });
      });
      request.setTimeout(8_000, () => request.destroy(new Error("timeout")));
      request.on("error", () => reject(new CoreError("bark_unreachable", 502, "无法连接 Bark 服务。")));
      request.end();
    });
  }

  private setEventState(channelId: string, fingerprint: string, active: boolean, lastSentAt: string | null): void {
    this.database.execute(`
      INSERT INTO event_states(channel_id, fingerprint, active, last_sent_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(channel_id, fingerprint) DO UPDATE SET
        active = excluded.active, last_sent_at = excluded.last_sent_at, updated_at = excluded.updated_at
    `, channelId, fingerprint, Number(active), lastSentAt, new Date().toISOString());
  }

  private recordHistory(channelId: string | null, eventType: string, fingerprint: string, title: string, body: string, status: "sent" | "error" | "suppressed", errorMessage: string | null): void {
    this.database.execute(`
      INSERT INTO notification_history(id, channel_id, event_type, fingerprint, title, body, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, `history-${randomUUID()}`, channelId, eventType, fingerprint, title.slice(0, 200), body.slice(0, 2000), status, errorMessage?.slice(0, 500) ?? null, new Date().toISOString());
  }

  private findChannel(id: string): ChannelRow | null {
    return this.database.queryOne<ChannelRow>(`SELECT id, provider, name, enabled, secret_id, created_at, updated_at FROM notification_channels WHERE id = ?`, id);
  }

  private requireChannelRow(id: string): ChannelRow {
    const row = this.findChannel(id);
    if (!row) throw new CoreError("channel_not_found", 404, "通知渠道不存在。");
    return row;
  }

  private requireChannel(id: string): NotificationChannel { return this.publicChannel(this.requireChannelRow(id)); }
  private publicChannel(row: ChannelRow): NotificationChannel {
    return { id: row.id, provider: row.provider, name: row.name, enabled: Boolean(row.enabled), configured: Boolean(row.secret_id), createdAt: row.created_at, updatedAt: row.updated_at };
  }

  private validateBarkEndpoint(endpoint: string): void {
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new CoreError("invalid_bark_endpoint", 400, "Bark Token 地址不是有效 URL。"); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname === "/") {
      throw new CoreError("invalid_bark_endpoint", 400, "Bark Token 地址必须是包含 Device Key 的 HTTP(S) URL。");
    }
  }

  private validateClock(value: string | null): string | null {
    if (value === null || value === "") return null;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new CoreError("invalid_quiet_hours", 400, "Quiet Hours 时间必须为 HH:mm。");
    return value;
  }

  private validateTimeZone(value: string): void {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); }
    catch { throw new CoreError("invalid_time_zone", 400, "时区名称无效。"); }
  }

  private inQuietHours(rule: RuleRow): boolean {
    if (!rule.quiet_start || !rule.quiet_end) return false;
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: rule.time_zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
      const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
      const current = hour * 60 + minute;
      const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      const start = toMinutes(rule.quiet_start); const end = toMinutes(rule.quiet_end);
      return start === end ? false : start < end ? current >= start && current < end : current >= start || current < end;
    } catch { return false; }
  }

  private defaultCooldown(type: ConsoleEventType): number {
    if (type === "event-warning") return 900;
    if (type === "event-error") return 300;
    if (type === "daily-digest") return 3600;
    return 300;
  }
}
