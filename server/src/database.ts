import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATION_VERSION = 1;

export class AppDatabase {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(path.dirname(databasePath), { recursive: true });
    }

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

    const existing = this.db
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(MIGRATION_VERSION);
    if (existing) return;

    this.transaction(() => {
      this.db.exec(`
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
      `);

      this.db
        .prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)")
        .run(MIGRATION_VERSION, new Date().toISOString());
    });
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

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO app_meta(key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `)
      .run(key, value, new Date().toISOString());
  }

  deleteMeta(key: string): void {
    this.db.prepare("DELETE FROM app_meta WHERE key = ?").run(key);
  }

  quickCheck(): boolean {
    const row = this.db.prepare("PRAGMA quick_check").get() as Record<string, unknown> | undefined;
    return row ? Object.values(row)[0] === "ok" : false;
  }

  close(): void {
    this.db.close();
  }
}
