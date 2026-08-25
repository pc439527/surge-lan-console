import type { AppDatabase } from "./database.js";
import { CoreError } from "./errors.js";
import { decryptSecret, encryptSecret } from "./security.js";

interface SecretRow {
  id: string;
  kind: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

export class SecretVault {
  constructor(private readonly database: AppDatabase) {}

  put(id: string, kind: string, plaintext: string, vaultKey: Buffer): void {
    const encrypted = encryptSecret(plaintext, vaultKey);
    const now = new Date().toISOString();
    this.database.execute(`
      INSERT INTO secrets(id, kind, ciphertext, iv, auth_tag, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        kind = excluded.kind,
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        updated_at = excluded.updated_at
    `, id, kind, encrypted.ciphertext, encrypted.iv, encrypted.authTag, now, now);
  }

  read(id: string, expectedKind: string, vaultKey: Buffer): string {
    const row = this.database.queryOne<SecretRow>(
      "SELECT id, kind, ciphertext, iv, auth_tag FROM secrets WHERE id = ?",
      id,
    );
    if (!row || row.kind !== expectedKind) {
      throw new CoreError("secret_missing", 409, "所需的加密凭据不存在，请重新配置。");
    }
    try {
      return decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }, vaultKey);
    } catch {
      throw new CoreError("secret_corrupt", 500, "本地加密凭据无法解密。");
    }
  }

  delete(id: string): void {
    this.database.execute("DELETE FROM secrets WHERE id = ?", id);
  }
}
