import { mkdirSync } from "node:fs";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

type DbValue = string | number | bigint | null;

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS secrets (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL CHECK(protocol IN ('http', 'https')),
        host TEXT NOT NULL,
        port INTEGER NOT NULL CHECK(port BETWEEN 1 AND 65535),
        platform TEXT CHECK(platform IS NULL OR platform IN ('ios', 'tvos', 'macos')),
        secret_id TEXT REFERENCES secrets(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS notification_channels (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK(provider IN ('bark')),
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        secret_id TEXT REFERENCES secrets(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS notification_rules (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        cooldown_seconds INTEGER NOT NULL DEFAULT 300 CHECK(cooldown_seconds >= 0),
        quiet_start TEXT,
        quiet_end TEXT,
        time_zone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(channel_id, event_type)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS notification_history (
        id TEXT PRIMARY KEY,
        channel_id TEXT REFERENCES notification_channels(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('sent', 'error', 'suppressed')),
        error_message TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_notification_history_created ON notification_history(created_at DESC);

      CREATE TABLE IF NOT EXISTS event_states (
        channel_id TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
        last_sent_at TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(channel_id, fingerprint)
      ) STRICT;
    `,
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        connection_id TEXT REFERENCES connections(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
        interval_seconds INTEGER NOT NULL CHECK(interval_seconds >= 30),
        config_json TEXT NOT NULL DEFAULT '{}',
        next_run_at TEXT NOT NULL,
        last_run_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(type, connection_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_jobs_due ON scheduled_jobs(enabled, next_run_at);

      CREATE TABLE IF NOT EXISTS job_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK(status IN ('success', 'error', 'skipped')),
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        message TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_job_runs_created ON job_runs(created_at DESC);

      CREATE TABLE IF NOT EXISTS collector_samples (
        id TEXT PRIMARY KEY,
        connection_id TEXT REFERENCES connections(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        value_json TEXT NOT NULL,
        sampled_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_collector_samples_lookup
        ON collector_samples(connection_id, kind, sampled_at DESC);
    `,
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS collector_state (
        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        collector TEXT NOT NULL,
        cursor_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL,
        PRIMARY KEY(connection_id, collector)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_collector_samples_sampled_at
        ON collector_samples(sampled_at);
    `,
  },
  {
    version: 6,
    sql: `
      CREATE TABLE IF NOT EXISTS traffic_rollups (
        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        bucket_seconds INTEGER NOT NULL CHECK(bucket_seconds IN (300, 3600)),
        bucket_start TEXT NOT NULL,
        sample_count INTEGER NOT NULL CHECK(sample_count > 0),
        avg_upload_rate REAL NOT NULL CHECK(avg_upload_rate >= 0),
        avg_download_rate REAL NOT NULL CHECK(avg_download_rate >= 0),
        max_upload_rate REAL NOT NULL CHECK(max_upload_rate >= 0),
        max_download_rate REAL NOT NULL CHECK(max_download_rate >= 0),
        upload_bytes_delta REAL NOT NULL CHECK(upload_bytes_delta >= 0),
        download_bytes_delta REAL NOT NULL CHECK(download_bytes_delta >= 0),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(connection_id, bucket_seconds, bucket_start)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_traffic_rollups_range
        ON traffic_rollups(connection_id, bucket_seconds, bucket_start);
    `,
  },
  {
    version: 7,
    sql: `
      CREATE TABLE IF NOT EXISTS profile_snapshots (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
        sha256 TEXT NOT NULL,
        profile_name TEXT NOT NULL,
        content_text TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('scheduled', 'manual', 'reload')),
        captured_at TEXT NOT NULL,
        UNIQUE(connection_id, sha256)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_profile_snapshots_history
        ON profile_snapshots(connection_id, captured_at DESC);
    `,
  },
];

export class AppDatabase {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });

    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);

    for (const migration of MIGRATIONS) {
      const existing = this.db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(migration.version);
      if (existing) continue;
      this.transaction(() => {
        this.db.exec(migration.sql);
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
          .run(migration.version, new Date().toISOString());
      });
    }
  }

  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = work();
      this.db.exec("COMMIT;");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  queryOne<T>(sql: string, ...params: DbValue[]): T | null {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  queryAll<T>(sql: string, ...params: DbValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  execute(sql: string, ...params: DbValue[]): void {
    this.db.prepare(sql).run(...params);
  }

  getMeta(key: string): string | null {
    const row = this.queryOne<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", key);
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.execute(`
      INSERT INTO app_meta(key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `, key, value, new Date().toISOString());
  }

  deleteMeta(key: string): void {
    this.execute("DELETE FROM app_meta WHERE key = ?", key);
  }

  quickCheck(): boolean {
    const row = this.db.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
    return row ? Object.values(row)[0] === "ok" : false;
  }

  async backupTo(destination: string): Promise<number> {
    return backup(this.db, destination, { rate: 100 });
  }

  location(): string | null {
    return this.db.location();
  }

  close(): void {
    this.db.close();
  }
}
