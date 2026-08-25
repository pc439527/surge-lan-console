import { createHash } from "node:crypto";
import { CoreError } from "./errors.js";

export type CollectedEventSeverity = "warning" | "error";

export interface CollectedSurgeEvent {
  key: string;
  identifier: string;
  date: string;
  type: number;
  content: string;
  severity: CollectedEventSeverity | null;
}

function asFiniteInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function eventDate(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function eventContent(row: Record<string, unknown>): string {
  for (const key of ["content", "message", "event", "title"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 2000);
  }
  return "Surge event";
}

function eventKey(identifier: string, date: string, type: number, content: string): string {
  if (identifier) return `id:${identifier}`;
  const digest = createHash("sha256")
    .update(date)
    .update("\0")
    .update(String(type))
    .update("\0")
    .update(content)
    .digest("hex")
    .slice(0, 32);
  return `hash:${digest}`;
}

function severityForType(type: number): CollectedEventSeverity | null {
  if (type >= 2) return "error";
  if (type === 1) return "warning";
  return null;
}

export function parseSurgeEvents(body: Buffer | string): CollectedSurgeEvent[] {
  let payload: unknown;
  try {
    payload = JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new CoreError("events_parse_error", 502, "Events API 返回了无法解析的 JSON。");
  }

  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown[] }).events)
      ? (payload as { events: unknown[] }).events
      : null;

  if (!rows) throw new CoreError("events_parse_error", 502, "Events API 返回结构无法识别。");

  const events: CollectedSurgeEvent[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const identifier = typeof row.identifier === "string" ? row.identifier.trim() : "";
    const type = asFiniteInteger(row.type) ?? asFiniteInteger(row.level) ?? 0;
    const date = eventDate(row.date);
    const content = eventContent(row);
    events.push({
      key: eventKey(identifier, date, type, content),
      identifier,
      date,
      type,
      content,
      severity: severityForType(type),
    });
  }

  return events;
}
