import { describe, expect, it } from "vitest";
import type { RequestItem } from "@/api/types";
import { buildRequestTimingWaterfall } from "./request-timing";
const request = (patch: Partial<RequestItem>): RequestItem => ({ startDate: 1_700_000_000_000, completedDate: 1_700_000_000_100, timingRecords: [], ...patch } as RequestItem);
describe("buildRequestTimingWaterfall", () => {
  it("builds ordered offsets against total request time", () => {
    const result = buildRequestTimingWaterfall(request({ timingRecords: [{ name: "DNS", durationInMillisecond: 20 }, { name: "Connect", durationInMillisecond: 30 }] }));
    expect(result.totalMs).toBe(100);
    expect(result.phases.map((phase) => [phase.name, phase.offsetPercent, phase.widthPercent])).toEqual([["DNS", 0, 20], ["Connect", 20, 30]]);
  });
  it("returns an empty waterfall without valid records", () => {
    expect(buildRequestTimingWaterfall(request({ timingRecords: [] })).phases).toEqual([]);
  });
});
