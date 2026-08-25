import type { AppDatabase } from "./database.js";
import { AuthError } from "./errors.js";
import type { RuntimeVault } from "./runtime-vault.js";
import {
  createPasswordMaterial,
  unlockVault,
  type PasswordRecord,
  type VaultEnvelope,
} from "./security.js";
import type { SessionStore } from "./session-store.js";

export { AuthError } from "./errors.js";

const PASSWORD_META_KEY = "auth.password.v1";
const VAULT_META_KEY = "auth.vault-envelope.v1";
const INITIALIZED_AT_KEY = "auth.initialized-at";

export interface AuthState {
  initialized: boolean;
  authenticated: boolean;
  sessionExpiresAt: string | null;
}

export class AuthService {
  constructor(
    private readonly database: AppDatabase,
    private readonly sessions: SessionStore,
    private readonly runtimeVault: RuntimeVault,
  ) {}

  isInitialized(): boolean {
    return Boolean(this.database.getMeta(PASSWORD_META_KEY) && this.database.getMeta(VAULT_META_KEY));
  }

  state(token: string | null): AuthState {
    const initialized = this.isInitialized();
    const session = initialized ? this.sessions.get(token) : null;
    return {
      initialized,
      authenticated: Boolean(session),
      sessionExpiresAt: session ? new Date(session.expiresAt).toISOString() : null,
    };
  }

  async setup(password: string, confirmPassword: string): Promise<{ token: string; expiresAt: number }> {
    if (this.isInitialized()) throw new AuthError("already_initialized", 409, "数据密码已经初始化。");
    this.validatePassword(password, confirmPassword);

    const material = await createPasswordMaterial(password);
    try {
      this.database.transaction(() => {
        if (this.isInitialized()) throw new AuthError("already_initialized", 409, "数据密码已经初始化。");
        this.database.setMeta(PASSWORD_META_KEY, JSON.stringify(material.passwordRecord));
        this.database.setMeta(VAULT_META_KEY, JSON.stringify(material.vaultEnvelope));
        this.database.setMeta(INITIALIZED_AT_KEY, new Date().toISOString());
      });
      this.runtimeVault.unlock(material.vaultKey);
      return this.sessions.create(material.vaultKey);
    } finally {
      material.vaultKey.fill(0);
    }
  }

  async unlock(password: string): Promise<{ token: string; expiresAt: number }> {
    if (!this.isInitialized()) throw new AuthError("not_initialized", 409, "请先初始化数据密码。");
    if (!password) throw new AuthError("password_required", 400, "请输入数据密码。");

    const passwordRecord = this.parseMeta<PasswordRecord>(PASSWORD_META_KEY);
    const vaultEnvelope = this.parseMeta<VaultEnvelope>(VAULT_META_KEY);
    const vaultKey = await unlockVault(password, passwordRecord, vaultEnvelope);
    if (!vaultKey) throw new AuthError("invalid_password", 401, "数据密码错误。");

    try {
      this.runtimeVault.unlock(vaultKey);
      return this.sessions.create(vaultKey);
    } finally {
      vaultKey.fill(0);
    }
  }

  /** Manual lock is global: revoke every browser session and wipe the runtime DEK lease. */
  lock(): void {
    this.sessions.clear();
    this.runtimeVault.lock();
  }

  private validatePassword(password: string, confirmPassword: string): void {
    if (password.length < 8) throw new AuthError("password_too_short", 400, "数据密码至少需要 8 个字符。");
    if (password.length > 256) throw new AuthError("password_too_long", 400, "数据密码不能超过 256 个字符。");
    if (password !== confirmPassword) throw new AuthError("password_mismatch", 400, "两次输入的数据密码不一致。");
  }

  private parseMeta<T>(key: string): T {
    const raw = this.database.getMeta(key);
    if (!raw) throw new AuthError("vault_corrupt", 500, "本地安全数据不完整。");
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new AuthError("vault_corrupt", 500, "本地安全数据无法解析。");
    }
  }
}
