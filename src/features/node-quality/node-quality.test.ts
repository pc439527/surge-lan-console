import { describe, expect, it } from "vitest";
import { dedupeNodeQualities, nodeQuality, rankNodes } from "./node-quality";

describe("node quality", () => {
  it("ranks measured nodes before failed tests and untested nodes", () => {
    const rows = rankNodes([
      nodeQuality("untested", "g"),
      nodeQuality("failed", "g", { ok: false }),
      nodeQuality("measured", "g", { ok: true, latency: 42 }),
    ]);

    expect(rows.map((row) => row.name)).toEqual(["measured", "failed", "untested"]);
    expect(rows[0]?.score).toBe(92);
    expect(rows[1]?.tested).toBe(true);
    expect(rows[1]?.reachable).toBe(false);
    expect(rows[2]?.tested).toBe(false);
  });

  it("deduplicates the same lineHash across policy groups", () => {
    const rows = dedupeNodeQualities([
      nodeQuality("HK-01", "Proxy", { ok: true, latency: 40 }, { lineHash: "node-hash-1", typeDescription: "ss" }),
      nodeQuality("HK-01", "Streaming", { ok: true, latency: 60 }, { lineHash: "node-hash-1", typeDescription: "ss" }),
      nodeQuality("HK-01", "Auto", { ok: true, latency: 50 }, { lineHash: "node-hash-1", typeDescription: "ss" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.groups).toEqual(["Auto", "Proxy", "Streaming"]);
    expect(rows[0]?.latencyMs).toBe(50);
    expect(rows[0]?.tested).toBe(true);
    expect(rows[0]?.reachable).toBe(true);
  });

  it("preserves a tested failure when duplicate memberships include untested rows", () => {
    const rows = dedupeNodeQualities([
      nodeQuality("HK-02", "Proxy", undefined, { lineHash: "node-hash-2", typeDescription: "ss" }),
      nodeQuality("HK-02", "Streaming", { ok: false }, { lineHash: "node-hash-2", typeDescription: "ss" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.tested).toBe(true);
    expect(rows[0]?.reachable).toBe(false);
    expect(rows[0]?.latencyMs).toBeNull();
  });

  it("falls back to normalized node name and type when lineHash is missing", () => {
    const rows = dedupeNodeQualities([
      nodeQuality(" HK-01 ", "Proxy", { ok: true, latency: 48 }, { typeDescription: "SS" }),
      nodeQuality("hk-01", "Auto", { ok: true, latency: 52 }, { typeDescription: "ss" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.groups).toEqual(["Auto", "Proxy"]);
    expect(rows[0]?.latencyMs).toBe(50);
  });

  it("keeps nodes separate when Surge returns different lineHash values", () => {
    const rows = dedupeNodeQualities([
      nodeQuality("HK-01", "Proxy", { ok: true, latency: 40 }, { lineHash: "node-hash-a", typeDescription: "ss" }),
      nodeQuality("HK-01", "Streaming", { ok: true, latency: 60 }, { lineHash: "node-hash-b", typeDescription: "ss" }),
    ]);

    expect(rows).toHaveLength(2);
  });
});
