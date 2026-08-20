import type { RequestItem } from "@/api/types";
import { normalizeDurationMs } from "@/api/normalize";

export interface TimingPhase {
  name: string;
  durationMs: number;
  offsetPercent: number;
  widthPercent: number;
}

export interface RequestTimingWaterfall {
  phases: TimingPhase[];
  totalMs: number | null;
}

/** Convert Surge's ordered timing records into a stable, readable waterfall. */
export function buildRequestTimingWaterfall(request: RequestItem): RequestTimingWaterfall {
  const records = (request.timingRecords ?? []).filter(
    (record) => Number.isFinite(record.durationInMillisecond) && record.durationInMillisecond >= 0,
  );
  const recordedMs = records.reduce((sum, record) => sum + record.durationInMillisecond, 0);
  const requestMs: number | null = normalizeDurationMs(request.startDate, request.completedDate) ?? null;
  const totalMs = Math.max(recordedMs, requestMs ?? 0);
  if (records.length === 0 || totalMs <= 0) return { phases: [], totalMs: requestMs ?? null };

  let elapsed = 0;
  const phases = records.map((record) => {
    const phase = {
      name: record.name || "未命名阶段",
      durationMs: record.durationInMillisecond,
      offsetPercent: (elapsed / totalMs) * 100,
      widthPercent: Math.max((record.durationInMillisecond / totalMs) * 100, 1.5),
    };
    elapsed += record.durationInMillisecond;
    return phase;
  });
  return { phases, totalMs };
}
