import { SurgeError } from "@/api/errors";
import type { SurgeEventItem } from "@/api/types";

/**
 * /v1/events normalizer (OPTIMIZATION_PLAN Task 04/07, §16).
 *
 * Surge builds drift on the event payload:
 *   - envelope   { events: [...] }   or a bare array
 *   - date       ISO string | epoch seconds | epoch ms | numeric string
 *   - type       0/1/2 number | numeric string
 *   - identifier may be missing on some platforms
 *
 * Calibration rules (v0.2.1, T03):
 *   - every row is coerced (type → number, date → ISO string) instead of
 *     failing the whole list because ONE row drifted;
 *   - junk rows (no usable field) are counted as invalid, not displayed;
 *   - N>0 raw rows but 0 recognized rows THROWS ("N raw records, 0
 *     recognized records") — Diagnostics OK must mean the Events page parses.
 *
 * `normalizeEvents` is the single parser used by BOTH the page (via
 * SurgeClient.getEvents) and Diagnostics.
 */
export interface EventsAnalysis {
  events: SurgeEventItem[];
  /** Raw rows returned by the API (before per-row validation). */
  rawCount: number;
  /** Rows that produced a usable event. */
  validCount: number;
  /** Rows that mapped to nothing. */
  invalidCount: number;
}

export function normalizeEvents(raw: unknown): EventsAnalysis {
  const list = extractEventList(raw);
  const mapped = list.map(mapEventRow);
  const valid = mapped.filter((row) => row.ok);
  if (list.length > 0 && valid.length === 0) {
    throw new SurgeError(
      "unsupported",
      `/v1/events 返回了 ${list.length} 条记录，但 0 条被识别（identifier / date / type / content 缺失或类型不符）。请到「设置 → API Diagnostics」查看 Raw Structure 以校准解析器。`,
    );
  }
  return {
    events: valid.map((row) => row.event),
    rawCount: list.length,
    validCount: valid.length,
    invalidCount: list.length - valid.length,
  };
}

/**
 * Extract the raw event list from either supported shape.
 * Exported so Diagnostics counts raw rows with the SAME extractor the parser uses.
 */
export function extractEventList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    if (Array.isArray(rec.events)) return rec.events;
  }
  throw new SurgeError(
    "unsupported",
    "/v1/events 返回了无法识别的结构 — 预期为数组或 { events: [...] }。",
  );
}

interface MappedEvent {
  ok: boolean;
  event: SurgeEventItem;
}

function mapEventRow(item: unknown): MappedEvent {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { ok: false, event: emptyEvent() };
  }
  const rec = item as Record<string, unknown>;
  const identifier = typeof rec.identifier === "string" ? rec.identifier : "";
  const content = typeof rec.content === "string" ? rec.content : "";
  const type = coerceEventType(rec.type);
  const date = coerceEventDate(rec.date);
  const ok =
    identifier.trim() !== "" ||
    content.trim() !== "" ||
    type !== undefined ||
    date !== "";
  return {
    ok,
    event: {
      identifier,
      date,
      type: type ?? 0,
      allowDismiss: toFiniteNumber(rec.allowDismiss, 0),
      content,
    },
  };
}

function emptyEvent(): SurgeEventItem {
  return { identifier: "", date: "", type: 0, allowDismiss: 0, content: "" };
}

/** type may arrive as 0/1/2 or "1" — coerce to number, undefined when unusable. */
function coerceEventType(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  }
  return undefined;
}

/** date: ISO string | epoch seconds | epoch ms | numeric string → ISO string ("" when unusable). */
function coerceEventDate(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return "";
    if (!Number.isNaN(new Date(trimmed).getTime())) return trimmed;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return isoFromEpoch(n);
    return trimmed; // keep raw text; the page renders it as-is
  }
  if (typeof value === "number" && Number.isFinite(value)) return isoFromEpoch(value);
  return "";
}

function isoFromEpoch(epoch: number): string {
  // Surge may report epoch seconds or epoch ms; >1e12 can only be ms.
  const ms = Math.abs(epoch) > 1e12 ? epoch : epoch * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}
