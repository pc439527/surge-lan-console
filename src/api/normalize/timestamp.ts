/**
 * Timestamp normalization (OPTIMIZATION_PLAN §10, Task 07).
 *
 * Surge API fields like `startDate` / `completedDate` / `expiresTime` are
 * NOT guaranteed to share a unit across platforms (macOS / iOS / tvOS) or
 * even across fields. This module converts any of the known shapes to
 * epoch-milliseconds, and refuses unknown shapes instead of guessing.
 */

/** Normalize an epoch value (seconds or milliseconds) to epoch-ms; undefined when invalid. */
export function normalizeEpoch(value?: number | null): number | undefined {
  // 0 / falsy is treated as "no timestamp" (matches OPTIMIZATION_PLAN §10.1)
  if (!value || !Number.isFinite(value)) {
    return undefined;
  }
  // Unix seconds
  if (value < 10_000_000_000) {
    return value * 1000;
  }
  // Unix milliseconds
  if (value < 10_000_000_000_000) {
    return value;
  }
  return undefined;
}

/**
 * Duration in ms between two raw epoch values of (possibly) different units.
 * Returns undefined when either value is invalid or the duration is negative
 * (e.g. completed < start), mirroring the "—" display contract.
 */
export function normalizeDurationMs(startRaw?: number | null, endRaw?: number | null): number | undefined {
  const start = normalizeEpoch(startRaw);
  const end = normalizeEpoch(endRaw);
  if (start === undefined || end === undefined) return undefined;
  const duration = end - start;
  if (duration < 0) return undefined;
  return duration;
}