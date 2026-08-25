import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppDatabase } from "./database.js";
import { CoreError } from "./errors.js";

export type BackupSource = "scheduled" | "manual" | "restore-point";

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

export interface RestorePreparation {
  backup: BackupValidation;
  safetyBackup: BackupValidation;
  restartRequired: true;
}

export interface PreparedRestore {
  result: RestorePreparation;
  apply: () => Promise<void>;
  cancel: () => void;
}

const BACKUP_RE = /^surge-console-\d{8}T\d{6}Z-(scheduled|manual|restore-point)-[a-f0-9]{8}\.db$/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const MAX_BACKUPS = 30;

export class BackupService {
  private readonly backupDir: string;
  private readonly databasePath: string;

  constructor(private readonly database: AppDatabase, backupDir?: string) {
    const databasePath = database.location();
    if (!databasePath) {
      throw new CoreError("backup_unavailable", 409, "内存数据库不支持持久化备份。");
    }
    this.databasePath = databasePath;
    this.backupDir = backupDir ?? path.join(path.dirname(databasePath), "backups");
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

  /**
   * Prepare a restore while the live database is still open.
   *
   * The selected backup is copied to a same-filesystem staging path and verified
   * again before a restore-point backup of the current live database is created.
   * The returned apply() MUST only be called after all database users have been
   * stopped and AppDatabase.close() has completed.
   */
  async prepareRestore(id: string, expectedSha256: string): Promise<PreparedRestore> {
    if (!SHA256_RE.test(expectedSha256)) {
      throw new CoreError("restore_sha_required", 400, "恢复操作需要有效的备份 SHA-256。");
    }

    const selected = await this.validate(id);
    if (!selected.valid) {
      throw new CoreError("restore_validation_failed", 409, `备份完整性校验失败：${selected.quickCheck}`);
    }
    if (selected.sha256 !== expectedSha256) {
      throw new CoreError("restore_backup_changed", 409, "备份文件在确认后发生变化，请重新验证后再恢复。");
    }

    const currentSchemaVersion = this.database.queryOne<{ version: number | null }>(
      "SELECT MAX(version) AS version FROM schema_migrations",
    )?.version ?? 0;
    if ((selected.schemaVersion ?? 0) > currentSchemaVersion) {
      throw new CoreError(
        "restore_schema_too_new",
        409,
        `备份 schema v${selected.schemaVersion} 高于当前 Core v${currentSchemaVersion}，请先升级 Console。`,
      );
    }

    const stagedPath = `${this.databasePath}.restore-${randomUUID()}.pending`;
    rmSync(stagedPath, { force: true });

    try {
      copyFileSync(path.join(this.backupDir, selected.id), stagedPath);
      const staged = await this.validatePath(stagedPath, selected.id, selected.source);
      if (!staged.valid || staged.sha256 !== selected.sha256) {
        throw new CoreError("restore_stage_validation_failed", 409, "恢复暂存文件校验失败，未执行数据库替换。");
      }

      // Create the safety point only after staging. create() may prune the oldest
      // backup, so the staged copy must already be independent of the source file.
      const safetyBackup = await this.create("restore-point");
      let consumed = false;

      return {
        result: { backup: selected, safetyBackup, restartRequired: true },
        apply: async () => {
          if (consumed) throw new CoreError("restore_already_consumed", 409, "恢复计划已执行或取消。");
          consumed = true;
          await this.applyStagedRestore(stagedPath, selected.sha256);
        },
        cancel: () => {
          if (consumed) return;
          consumed = true;
          rmSync(stagedPath, { force: true });
        },
      };
    } catch (error) {
      rmSync(stagedPath, { force: true });
      if (error instanceof CoreError) throw error;
      throw new CoreError("restore_prepare_failed", 500, error instanceof Error ? error.message : "恢复准备失败。");
    }
  }

  private async applyStagedRestore(stagedPath: string, expectedSha256: string): Promise<void> {
    const rollbackPath = `${this.databasePath}.restore-rollback-${randomUUID()}`;
    let currentMoved = false;

    try {
      // A clean AppDatabase.close() checkpoints WAL. Remove any stale sidecars so
      // they can never be replayed against the restored main database file.
      rmSync(`${this.databasePath}-wal`, { force: true });
      rmSync(`${this.databasePath}-shm`, { force: true });

      renameSync(this.databasePath, rollbackPath);
      currentMoved = true;
      renameSync(stagedPath, this.databasePath);

      const restored = await this.validatePath(this.databasePath, path.basename(this.databasePath), "restore-point");
      if (!restored.valid || restored.sha256 !== expectedSha256) {
        throw new CoreError("restore_postcheck_failed", 500, "恢复后的 SQLite 文件完整性校验失败。");
      }

      rmSync(rollbackPath, { force: true });
    } catch (error) {
      // Restore the exact cleanly-closed pre-operation database if anything after
      // the first rename fails. A separate Online Backup restore-point also remains.
      try {
        rmSync(this.databasePath, { force: true });
        if (currentMoved && existsSync(rollbackPath)) renameSync(rollbackPath, this.databasePath);
      } catch (rollbackError) {
        const detail = rollbackError instanceof Error ? rollbackError.message : "unknown rollback error";
        throw new CoreError("restore_rollback_failed", 500, `数据库恢复失败，文件级回滚也失败：${detail}`);
      } finally {
        rmSync(stagedPath, { force: true });
      }

      if (error instanceof CoreError) throw error;
      throw new CoreError("restore_failed", 500, error instanceof Error ? error.message : "数据库恢复失败。");
    } finally {
      rmSync(stagedPath, { force: true });
      if (existsSync(rollbackPath) && existsSync(this.databasePath)) rmSync(rollbackPath, { force: true });
    }
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
  const source = match?.[1];
  if (source === "scheduled" || source === "restore-point") return source;
  return "manual";
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
