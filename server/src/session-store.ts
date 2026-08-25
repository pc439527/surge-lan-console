import { hashSessionToken, newSessionToken } from "./security.js";

interface SessionRecord {
  vaultKey: Buffer;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface SessionInfo {
  authenticated: true;
  expiresAt: number;
  vaultKey: Buffer;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    private readonly idleMs: number,
    private readonly absoluteMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  create(vaultKey: Buffer): { token: string; expiresAt: number } {
    this.prune();
    const token = newSessionToken();
    const createdAt = this.now();
    const expiresAt = createdAt + this.absoluteMs;
    this.sessions.set(hashSessionToken(token), {
      vaultKey: Buffer.from(vaultKey),
      createdAt,
      lastSeenAt: createdAt,
      expiresAt,
    });
    return { token, expiresAt };
  }

  get(token: string | null): SessionInfo | null {
    if (!token) return null;
    const key = hashSessionToken(token);
    const session = this.sessions.get(key);
    if (!session) return null;

    const now = this.now();
    if (now >= session.expiresAt || now - session.lastSeenAt >= this.idleMs) {
      session.vaultKey.fill(0);
      this.sessions.delete(key);
      return null;
    }

    session.lastSeenAt = now;
    return {
      authenticated: true,
      expiresAt: session.expiresAt,
      vaultKey: session.vaultKey,
    };
  }

  revoke(token: string | null): void {
    if (!token) return;
    const key = hashSessionToken(token);
    const session = this.sessions.get(key);
    if (session) session.vaultKey.fill(0);
    this.sessions.delete(key);
  }

  clear(): void {
    for (const session of this.sessions.values()) session.vaultKey.fill(0);
    this.sessions.clear();
  }

  private prune(): void {
    const now = this.now();
    for (const [key, session] of this.sessions) {
      if (now >= session.expiresAt || now - session.lastSeenAt >= this.idleMs) {
        session.vaultKey.fill(0);
        this.sessions.delete(key);
      }
    }
  }
}
