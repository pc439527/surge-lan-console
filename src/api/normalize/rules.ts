import { SurgeError } from "@/api/errors";
import type { RuleInfo } from "@/api/types";

/**
 * /v1/rules normalizer (OPTIMIZATION_PLAN Task 05/07, §16 / §40).
 *
 * Real Surge builds return different shapes:
 *   - some return a bare array:       [{type, content, policy}]
 *   - some return an envelope:        { rules: [...] }
 *   - field names may drift over time (extra fields are kept as `raw`).
 *
 * Calibration rules (v0.2.1, T02):
 *   - each row is mapped through a small alias table (type / content / policy),
 *     so a build that renames fields still parses instead of showing "— — —";
 *   - a row counts as RECOGNIZED only if at least one of the three fields is a
 *     non-empty string — junk rows are counted, not displayed;
 *   - if the API returns N>0 raw rows but 0 recognized rows, we THROW a parse
 *     error ("N raw records, 0 recognized records") instead of silently
 *     rendering N rows of dashes. Unknown ≠ empty.
 *
 * `normalizeRules` is the page/client-facing array; `analyzeRules` is the
 * same single parser plus raw/parsed/invalid counts used by Diagnostics —
 * the two never disagree.
 */
export function normalizeRules(raw: unknown): RuleInfo[] {
  return analyzeRules(raw).rules;
}

export interface RulesAnalysis {
  rules: RuleInfo[];
  /** Raw rows returned by the API (before per-row validation). */
  rawCount: number;
  /** Rows that mapped to at least one real field. */
  validCount: number;
  /** Rows that mapped to nothing (null / {} / unknown field names). */
  invalidCount: number;
}

/** Single parser: validates the whole payload and reports per-row counts. */
export function analyzeRules(raw: unknown): RulesAnalysis {
  const list = extractRuleList(raw);
  const mapped = list.map(mapRuleRow);
  const valid = mapped.filter((row) => row.ok);
  if (list.length > 0 && valid.length === 0) {
    throw new SurgeError(
      "unsupported",
      `/v1/rules 返回了 ${list.length} 条记录，但 0 条被识别（字段名与预期不符）。请到「设置 → API Diagnostics」查看 Raw Structure 以校准解析器。`,
    );
  }
  return {
    rules: valid.map((row) => row.rule),
    rawCount: list.length,
    validCount: valid.length,
    invalidCount: list.length - valid.length,
  };
}

/** Field aliases observed / plausible across Surge builds (calibrate against the real device). */
const TYPE_KEYS = ["type", "ruleType", "rule_type"];
const CONTENT_KEYS = ["content", "rule", "payload"];
const POLICY_KEYS = ["policy", "policyName", "policy_name", "target"];

interface MappedRule {
  ok: boolean;
  rule: RuleInfo;
}

function mapRuleRow(item: unknown): MappedRule {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { ok: false, rule: { raw: item } };
  }
  const rec = item as Record<string, unknown>;
  const type = pickString(rec, TYPE_KEYS);
  const content = pickString(rec, CONTENT_KEYS);
  const policy = pickString(rec, POLICY_KEYS);
  // Recognized = at least one real value (empty strings don't count).
  const ok = hasValue(type) || hasValue(content) || hasValue(policy);
  return { ok, rule: { type, content, policy, raw: rec } };
}

function pickString(rec: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = rec[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

/**
 * Extract the raw rule list from either supported shape.
 * Exported so Diagnostics counts raw rows with the SAME extractor the parser uses.
 */
export function extractRuleList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    if (Array.isArray(rec.rules)) return rec.rules;
  }
  throw new SurgeError(
    "unsupported",
    "/v1/rules 返回了无法识别的结构 — 预期为数组或 { rules: [...] }。",
  );
}
