export interface NotificationAttempt {
  status: "sent" | "error";
  createdAt: string;
}

const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;
const MAX_FAILURES_FOR_EXPONENT = 7;

/**
 * Channel-wide exponential backoff derived from persisted delivery history.
 * A successful delivery resets the failure streak. Suppressed rows are not
 * passed here, so cooldown/quiet-hours decisions never extend provider backoff.
 */
export function providerBackoffRemainingMs(
  attemptsNewestFirst: NotificationAttempt[],
  nowMs = Date.now(),
): number {
  let consecutiveFailures = 0;
  let latestFailureAt: number | null = null;

  for (const attempt of attemptsNewestFirst) {
    if (attempt.status === "sent") break;
    const timestamp = new Date(attempt.createdAt).getTime();
    if (!Number.isFinite(timestamp)) continue;
    if (latestFailureAt === null) latestFailureAt = timestamp;
    consecutiveFailures += 1;
  }

  if (consecutiveFailures === 0 || latestFailureAt === null) return 0;
  const exponent = Math.min(consecutiveFailures - 1, MAX_FAILURES_FOR_EXPONENT);
  const backoffMs = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * (2 ** exponent));
  return Math.max(0, backoffMs - Math.max(0, nowMs - latestFailureAt));
}
