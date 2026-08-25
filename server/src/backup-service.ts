import { createHash, randomUUID } from "node:crypto";
import { createReadStream, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppDatabase } from "./database.js";
import { CoreError } from "./errors.js";

export type BackupSource = "scheduled" | "manual";

export interface BackupInfo {
  id: string;
  source: BackupSource;
  createdAt: string;
  sizeBytes: number;
}

export interface BackupValidation extends BackupInfo {
  valid: boolean;
  quickCheck: string;
  schemaVersion: number | null;
  sha256: string;
}

const BACKUP_RE = /^surge-console-\d{8}T\d{6}Z-(scheduled|manual)-[a-f0-9]{8}\.db$/;
const MAX_BACKUPS = 30;

export class BackupService {
  private readonly backupDir: string;

  constructor(private readonly database: AppDatabase, backupDir?: string) {
    const databasePath = database.location();
    if (!backupDir && !databasePath) {
      throw new CoreError("backup_unavailable", 409, "内存数据库不支持持久化备份。");
    }
    this.backupDir = backupDir ?? path.join(path.dirname(databasePath as string), "backups");
  }

  async create(source: BackupSource): Promise<BackupValidation> {
    mkdirSync(this.backupDir, { recursive: true });
    const id = this.makeBackupId(source);
    const finalPath = path.join(this.backupDir, id);
    const partialPath = `${finalPath}.partial`;

    try {
      await this.database.backupTo(partialPath);
      const validation = await this.validatePath(partialPath, id, source);
      if (!validation.valid) {
        throw new CoreError("backup_validation_failed", 500, `SQLite 备份完整性校验失败：${validation.quickCheck}`);
      }
      renameSync(partialPath, finalPath);
      this.prune();
      return { ...validation, sizeBytes: statSync(finalPath).size };
    } catch (error) {
      rmSync(partialPath, { force: true });
      if (error instanceof CoreError) throw error;
      throw new CoreError("backup_failed", 500, error instanceof Error ? error.message : "SQLite 备份失败。");
    }
  }

  list(): BackupInfo[] {
    mkdirSync(this.backupDir, { recursive: true });
    return readdirSync(this.backupDir)
      .filter((name) => BACKUP_RE.test(name))
      .map((id) => this.info(id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async validate(id: string): Promise<BackupValidation> {
    const safeId = this.requireBackupId(id);
    const source = sourceFromId(safeId);
    return this.validatePath(path.join(this.backupDir, safeId), safeId, source);
  }

  private async validatePath(filePath: string, id: string, source: BackupSource): Promise<BackupValidation> {
    let database: DatabaseSync | null = null;
    let quickCheck = "open-failed";
    let schemaVersion: number | null = null;
    try {
      database = new DatabaseSync(filePath, { readOnly: true });
      const check = database.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
      quickCheck = check ? String(Object.values(check)[0] ?? "unknown") : "unknown";
      const migration = database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version?: number | null } | undefined;
      schemaVersion = typeof migration?.version === "number" ? migration.version : null;
    } catch (error) {
      quickCheck = error instanceof Error ? error.message.slice(0, 200) : "validation-error";
    } finally {
      database?.close();
    }

    const stats = statSync(filePath);
    return {
      id,
      source,
      createdAt: stats.mtime.toISOString(),
      sizeBytes: stats.size,
      valid: quickCheck === "ok" && schemaVersion !== null,
      quickCheck,
      schemaVersion,
      sha256: await sha256File(filePath),
    };
  }

  private info(id: string): BackupInfo {
    const safeId = this.requireBackupId(id);
    const stats = statSync(path.join(this.backupDir, safeId));
    return {
      id: safeId,
      source: sourceFromId(safeId),
      createdAt: stats.mtime.toISOString(),
      sizeBytes: stats.size,
    };
  }

  private prune(): void {
    const backups = this.list();
    for (const backup of backups.slice(MAX_BACKUPS)) {
      rmSync(path.join(this.backupDir, backup.id), { force: true });
    }
  }

  private requireBackupId(id: string): string {
    if (path.basename(id) !== id || !BACKUP_RE.test(id)) {
      throw new CoreError("invalid_backup_id", 400, "备份文件标识无效。");
    }
    const fullPath = path.join(this.backupDir, id);
    try { statSync(fullPath); }
    catch { throw new CoreError("backup_not_found", 404, "备份文件不存在。"); }
    return id;
  }

  private makeBackupId(source: BackupSource): string {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return `surge-console-${stamp}-${source}-${randomUUID().replace(/-/g, "").slice(0, 8)}.db`;
  }
}

function sourceFromId(id: string): BackupSource {
  const match = id.match(BACKUP_RE);
  return match?.[1] === "scheduled" ? "scheduled" : "manual";
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}
