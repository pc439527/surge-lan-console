import { CoreError } from "./errors.js";

/**
 * Holds one unwrapped copy of the vault DEK in Core process memory so
 * background jobs keep working when no browser tab is open.
 *
 * The key is never persisted. Manual lock and process shutdown wipe it.
 * After a Core restart the user must unlock once before protected jobs resume.
 */
export class RuntimeVault {
  private vaultKey: Buffer | null = null;

  unlock(vaultKey: Buffer): void {
    this.lock();
    this.vaultKey = Buffer.from(vaultKey);
  }

  isUnlocked(): boolean {
    return this.vaultKey !== null;
  }

  getKey(): Buffer {
    if (!this.vaultKey) {
      throw new CoreError("vault_locked", 423, "本地数据保险库已锁定，请先解锁控制台。");
    }
    return Buffer.from(this.vaultKey);
  }

  lock(): void {
    if (this.vaultKey) this.vaultKey.fill(0);
    this.vaultKey = null;
  }
}
