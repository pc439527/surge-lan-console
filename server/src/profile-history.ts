import { createHash, randomUUID } from "node:crypto";
import type { AppDatabase } from "./database.js";
import { CoreError } from "./errors.js";

const MAX_PROFILE_BYTES = 2 * 1024 * 1024;
const MAX_DIFF_LINES_PER_SIDE = 2_000;

export type ProfileSnapshotSource = "scheduled" | "manual" | "reload";

interface SnapshotRow {
  id: string;
  connection_id: string;
  sha256: string;
  profile_name: string;
  content_text: string;
  source: ProfileSnapshotSource;
  captured_at: string;
}

export interface ProfileSnapshot {
  id: string;
  connectionId: string;
  sha256: string;
  profileName: string;
  source: ProfileSnapshotSource;
  capturedAt: string;
  sizeBytes: number;
}

export interface ProfileSnapshotDetail extends ProfileSnapshot {
  content: string;
}

export interface ProfileDiffChunk {
  oldStartLine: number;
  newStartLine: number;
  removed: string[];
  added: string[];
}

export interface ProfileDiff {
  from: ProfileSnapshot;
  to: ProfileSnapshot;
  changed: boolean;
  addedLines: number;
  removedLines: number;
  truncated: boolean;
  chunks: ProfileDiffChunk[];
}

export interface ParsedProfilePayload {
  profileName: string;
  content: string;
}

export class ProfileHistoryService {
  constructor(
    private readonly database: AppDatabase,
    private readonly now: () => number = () => Date.now(),
  ) {}

  capture(
    connectionId: string,
    body: Buffer | string,
    source: ProfileSnapshotSource,
    capturedAtMs = this.now(),
  ): { snapshot: ProfileSnapshot; created: boolean } {
    const parsed = parseProfilePayload(body);
    const bytes = Buffer.byteLength(parsed.content, "utf8");
    if (bytes > MAX_PROFILE_BYTES) {
      throw new CoreError("profile_too_large", 413, "配置快照超过 2MB 安全上限，未写入历史记录。");
    }
    const sha256 = createHash("sha256").update(parsed.content, "utf8").digest("hex");
    const existing = this.database.queryOne<SnapshotRow>(`
      SELECT * FROM profile_snapshots WHERE connection_id = ? AND sha256 = ? LIMIT 1
    `, connectionId, sha256);
    if (existing) return { snapshot: publicSnapshot(existing), created: false };

    const id = `profile-${randomUUID()}`;
    const capturedAt = new Date(capturedAtMs).toISOString();
    this.database.execute(`
      INSERT INTO profile_snapshots(id, connection_id, sha256, profile_name, content_text, source, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, id, connectionId, sha256, parsed.profileName, parsed.content, source, capturedAt);
    return { snapshot: this.requireSnapshot(connectionId, id), created: true };
  }

  list(connectionId: string, limit = 100): ProfileSnapshot[] {
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    return this.database.queryAll<SnapshotRow>(`
      SELECT * FROM profile_snapshots
      WHERE connection_id = ?
      ORDER BY captured_at DESC
      LIMIT ?
    `, connectionId, safeLimit).map(publicSnapshot);
  }

  get(connectionId: string, id: string): ProfileSnapshotDetail {
    const row = this.requireSnapshotRow(connectionId, id);
    return { ...publicSnapshot(row), content: row.content_text };
  }

  diff(connectionId: string, fromId: string, toId: string): ProfileDiff {
    const from = this.get(connectionId, fromId);
    const to = this.get(connectionId, toId);
    const result = diffProfileText(from.content, to.content);
    return {
      from: withoutContent(from),
      to: withoutContent(to),
      ...result,
    };
  }

  private requireSnapshot(connectionId: string, id: string): ProfileSnapshot {
    return publicSnapshot(this.requireSnapshotRow(connectionId, id));
  }

  private requireSnapshotRow(connectionId: string, id: string): SnapshotRow {
    const row = this.database.queryOne<SnapshotRow>(`
      SELECT * FROM profile_snapshots WHERE connection_id = ? AND id = ?
    `, connectionId, id);
    if (!row) throw new CoreError("profile_snapshot_not_found", 404, "配置快照不存在。");
    return row;
  }
}

export function parseProfilePayload(body: Buffer | string): ParsedProfilePayload {
  const raw = Buffer.isBuffer(body) ? body.toString("utf8") : body;
  let profileName = "Profile.conf";
  let content = raw;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "string") {
      content = parsed;
    } else if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const object = parsed as Record<string, unknown>;
      if (typeof object.name === "string" && object.name.trim()) profileName = object.name.trim().slice(0, 200);
      if (typeof object.profile === "string") content = object.profile;
      else if (typeof object.originalProfile === "string") content = object.originalProfile;
      else throw new CoreError("profile_parse_error", 502, "Surge 配置响应缺少 profile 文本。");
    }
  } catch (error) {
    if (error instanceof CoreError) throw error;
    // Plain-text profile is a valid Surge response shape.
  }

  content = normalizeLineEndings(content);
  if (!content.trim()) throw new CoreError("profile_parse_error", 502, "Surge 返回了空配置，未创建历史快照。");
  return { profileName, content };
}

export function diffProfileText(fromText: string, toText: string): {
  changed: boolean;
  addedLines: number;
  removedLines: number;
  truncated: boolean;
  chunks: ProfileDiffChunk[];
} {
  if (fromText === toText) {
    return { changed: false, addedLines: 0, removedLines: 0, truncated: false, chunks: [] };
  }

  const fromLines = normalizeLineEndings(fromText).split("\n");
  const toLines = normalizeLineEndings(toText).split("\n");
  let prefix = 0;
  while (prefix < fromLines.length && prefix < toLines.length && fromLines[prefix] === toLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < fromLines.length - prefix &&
    suffix < toLines.length - prefix &&
    fromLines[fromLines.length - 1 - suffix] === toLines[toLines.length - 1 - suffix]
  ) suffix += 1;

  const removedAll = fromLines.slice(prefix, fromLines.length - suffix);
  const addedAll = toLines.slice(prefix, toLines.length - suffix);
  const truncated = removedAll.length > MAX_DIFF_LINES_PER_SIDE || addedAll.length > MAX_DIFF_LINES_PER_SIDE;
  const removed = removedAll.slice(0, MAX_DIFF_LINES_PER_SIDE);
  const added = addedAll.slice(0, MAX_DIFF_LINES_PER_SIDE);

  return {
    changed: true,
    addedLines: addedAll.length,
    removedLines: removedAll.length,
    truncated,
    chunks: [{ oldStartLine: prefix + 1, newStartLine: prefix + 1, removed, added }],
  };
}

function publicSnapshot(row: SnapshotRow): ProfileSnapshot {
  return {
    id: row.id,
    connectionId: row.connection_id,
    sha256: row.sha256,
    profileName: row.profile_name,
    source: row.source,
    capturedAt: row.captured_at,
    sizeBytes: Buffer.byteLength(row.content_text, "utf8"),
  };
}

function withoutContent(snapshot: ProfileSnapshotDetail): ProfileSnapshot {
  const { content: _content, ...result } = snapshot;
  return result;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}
