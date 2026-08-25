import { randomUUID } from "node:crypto";
import type { AppDatabase } from "./database.js";
import { CoreError } from "./errors.js";
import type { SecretVault } from "./secret-vault.js";

export type ConnectionProtocol = "http" | "https";
export type ConnectionPlatform = "ios" | "tvos" | "macos";

export interface ConnectionInput {
  id?: string;
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: number;
  platform?: ConnectionPlatform | null;
  apiKey?: string;
}

export interface PublicConnection {
  id: string;
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: number;
  platform: ConnectionPlatform | null;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionRow {
  id: string;
  name: string;
  protocol: ConnectionProtocol;
  host: string;
  port: number;
  platform: ConnectionPlatform | null;
  secret_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionCredentials {
  connection: PublicConnection;
  apiKey: string;
}

export class ConnectionService {
  constructor(
    private readonly database: AppDatabase,
    private readonly vault: SecretVault,
  ) {}

  list(): PublicConnection[] {
    return this.database.queryAll<ConnectionRow>(`
      SELECT id, name, protocol, host, port, platform, secret_id, created_at, updated_at
      FROM connections ORDER BY created_at ASC
    `).map((row) => this.publicRow(row));
  }

  get(id: string): PublicConnection {
    return this.publicRow(this.requireRow(id));
  }

  create(input: ConnectionInput, vaultKey: Buffer, preserveId = false): PublicConnection {
    const normalized = this.validate(input);
    const requestedId = preserveId && input.id && /^[A-Za-z0-9._:-]{1,128}$/.test(input.id) ? input.id : null;
    const id = requestedId ?? `conn-${randomUUID()}`;
    if (this.findRow(id)) return this.get(id);

    const secretId = normalized.apiKey ? `surge:${id}:api-key` : null;
    const now = new Date().toISOString();
    this.database.transaction(() => {
      if (secretId && normalized.apiKey) this.vault.put(secretId, "surge-api-key", normalized.apiKey, vaultKey);
      this.database.execute(`
        INSERT INTO connections(id, name, protocol, host, port, platform, secret_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, normalized.name, normalized.protocol, normalized.host, normalized.port, normalized.platform, secretId, now, now);
    });
    return this.get(id);
  }

  update(id: string, input: Partial<ConnectionInput>, vaultKey: Buffer): PublicConnection {
    const current = this.requireRow(id);
    const merged = this.validate({
      name: input.name ?? current.name,
      protocol: input.protocol ?? current.protocol,
      host: input.host ?? current.host,
      port: input.port ?? current.port,
      platform: input.platform === undefined ? current.platform : input.platform,
      apiKey: input.apiKey,
    }, true);

    let secretId = current.secret_id;
    this.database.transaction(() => {
      if (merged.apiKey) {
        secretId = secretId ?? `surge:${id}:api-key`;
        this.vault.put(secretId, "surge-api-key", merged.apiKey, vaultKey);
      }
      this.database.execute(`
        UPDATE connections
        SET name = ?, protocol = ?, host = ?, port = ?, platform = ?, secret_id = ?, updated_at = ?
        WHERE id = ?
      `, merged.name, merged.protocol, merged.host, merged.port, merged.platform, secretId, new Date().toISOString(), id);
    });
    return this.get(id);
  }

  delete(id: string): void {
    const row = this.requireRow(id);
    this.database.transaction(() => {
      this.database.execute("DELETE FROM connections WHERE id = ?", id);
      if (row.secret_id) this.vault.delete(row.secret_id);
    });
  }

  importLegacy(items: ConnectionInput[], vaultKey: Buffer): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;
    for (const item of items.slice(0, 100)) {
      if (item.id && this.findRow(item.id)) {
        skipped += 1;
        continue;
      }
      this.create(item, vaultKey, true);
      imported += 1;
    }
    return { imported, skipped };
  }

  getCredentials(id: string, vaultKey: Buffer): ConnectionCredentials {
    const row = this.requireRow(id);
    if (!row.secret_id) {
      throw new CoreError("api_key_missing", 409, "该连接尚未配置 Surge API Key。");
    }
    return {
      connection: this.publicRow(row),
      apiKey: this.vault.read(row.secret_id, "surge-api-key", vaultKey),
    };
  }

  private findRow(id: string): ConnectionRow | null {
    return this.database.queryOne<ConnectionRow>(`
      SELECT id, name, protocol, host, port, platform, secret_id, created_at, updated_at
      FROM connections WHERE id = ?
    `, id);
  }

  private requireRow(id: string): ConnectionRow {
    const row = this.findRow(id);
    if (!row) throw new CoreError("connection_not_found", 404, "连接不存在或已被删除。");
    return row;
  }

  private publicRow(row: ConnectionRow): PublicConnection {
    return {
      id: row.id,
      name: row.name,
      protocol: row.protocol,
      host: row.host,
      port: row.port,
      platform: row.platform,
      hasApiKey: Boolean(row.secret_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private validate(input: ConnectionInput, allowMissingApiKey = false): Required<Omit<ConnectionInput, "id" | "apiKey">> & { apiKey?: string } {
    const name = input.name.trim();
    const host = input.host.trim();
    if (!name || name.length > 80) throw new CoreError("invalid_connection", 400, "连接名称不能为空且不能超过 80 个字符。");
    if (!host || host.length > 255 || /[\s/]/.test(host) || host.includes("://")) {
      throw new CoreError("invalid_connection", 400, "主机地址格式无效，请只填写 IP 或主机名。");
    }
    if (input.protocol !== "http" && input.protocol !== "https") throw new CoreError("invalid_connection", 400, "仅支持 HTTP 或 HTTPS。");
    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CoreError("invalid_connection", 400, "端口必须在 1-65535 之间。");
    const platform = input.platform ?? null;
    if (platform !== null && !["ios", "tvos", "macos"].includes(platform)) throw new CoreError("invalid_connection", 400, "平台类型无效。");
    const apiKey = input.apiKey?.trim();
    if (!allowMissingApiKey && input.apiKey !== undefined && !apiKey) throw new CoreError("invalid_connection", 400, "API Key 不能为空。");
    if (apiKey && apiKey.length > 512) throw new CoreError("invalid_connection", 400, "API Key 长度异常。");
    return { name, protocol: input.protocol, host, port, platform, ...(apiKey ? { apiKey } : {}) };
  }
}
