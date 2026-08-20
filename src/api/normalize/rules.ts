import { SurgeError } from "@/api/errors";
import type { RuleInfo } from "@/api/types";

/**
 * /v1/rules normalizer (OPTIMIZATION_PLAN Task 05, §16 / §40).
 *
 * Real Surge builds return different shapes:
 *   - some return a bare array:       [{type, content, policy}]
 *   - some return an envelope:        { rules: [...] }
 *   - field names may drift over time (extra fields are kept as `raw`).
 *
 * Rule: unknown ≠ empty. If the shape is not recognized, we THROW a
 * parse error instead of silently returning [] — pages must show
 * "parse failed", never "no rules".
 */
export function normalizeRules(raw: unknown): RuleInfo[] {
  const list = extractRuleList(raw);
  return list.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      // Tolerate junk entries by keeping them as raw-only rows.
      return { type: undefined, content: undefined, policy: undefined, raw: item };
    }
    const rec = item as Record<string, unknown>;
    const type = typeof rec.type === "string" ? rec.type : undefined;
    const content = typeof rec.content === "string" ? rec.content : undefined;
    const policy = typeof rec.policy === "string" ? rec.policy : undefined;
    return { type, content, policy, raw: rec };
  });
}

function extractRuleList(raw: unknown): unknown[] {
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
