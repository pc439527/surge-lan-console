import { describe, expect, it } from "vitest";
import { extractEventList, normalizeEvents } from "./events";
import { SurgeError } from "@/api/errors";

describe("normalizeEvents (T03)", () => {
  it("parses an envelope { events: [...] }", () => {
    const n = normalizeEvents({
      events: [{ identifier: "a", date: "2024-01-01T00:00:00.000Z", type: 1, content: "warn" }],
    });
    expect(n).toMatchObject({ rawCount: 1, validCount: 1, invalidCount: 0 });
    expect(n.events[0]).toMatchObject({ identifier: "a", type: 1, content: "warn" });
  });

  it("parses a bare array", () => {
    const n = normalizeEvents([{ identifier: "b", date: "2024-01-01T00:00:00.000Z", type: 0, content: "ok" }]);
    expect(n.events).toHaveLength(1);
    expect(n.events[0].identifier).toBe("b");
  });

  it("coerces date epoch-seconds and epoch-ms to ISO strings", () => {
    const n = normalizeEvents([
      { identifier: "s", date: 1700000000, type: 0, content: "secs" },
      { identifier: "ms", date: 1700000000000, type: 0, content: "msecs" },
    ]);
    expect(n.events[0].date).toBe(new Date(1700000000 * 1000).toISOString());
    expect(n.events[1].date).toBe(new Date(1700000000000).toISOString());
  });

  it("coerces numeric-string type and date", () => {
    const n = normalizeEvents([{ identifier: "c", date: "1700000000", type: "2", content: "err" }]);
    expect(n.events[0].type).toBe(2);
    expect(n.events[0].date).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it("keeps ISO date strings untouched", () => {
    const iso = "2024-06-01T12:30:00.000Z";
    const n = normalizeEvents([{ identifier: "d", date: iso, type: 0, content: "x" }]);
    expect(n.events[0].date).toBe(iso);
  });

  it("one drifted row does not fail the whole list", () => {
    const n = normalizeEvents([
      { identifier: "ok", date: "2024-01-01T00:00:00.000Z", type: 0, content: "good" },
      { foo: 1 },
      null,
    ]);
    expect(n).toMatchObject({ rawCount: 3, validCount: 1, invalidCount: 2 });
    expect(n.events).toHaveLength(1);
    expect(n.events[0].content).toBe("good");
  });

  it("throws when N>0 rows are all unrecognized", () => {
    const raw = [{ foo: 1 }, { bar: 2 }];
    expect(() => normalizeEvents(raw)).toThrow(SurgeError);
    expect(() => normalizeEvents(raw)).toThrow(/0 条被识别/);
  });

  it("empty event list is a legitimate empty result", () => {
    expect(normalizeEvents([]).events).toEqual([]);
    expect(normalizeEvents({ events: [] })).toMatchObject({ rawCount: 0, validCount: 0, invalidCount: 0 });
  });

  it("throws for unrecognized structure", () => {
    expect(() => normalizeEvents(null)).toThrow(SurgeError);
    expect(() => normalizeEvents({ foo: 1 })).toThrow(SurgeError);
  });

  it("extractEventList is the same extractor for both shapes", () => {
    const list = [{ identifier: "x", date: "2024-01-01T00:00:00.000Z", type: 0, content: "x" }];
    expect(extractEventList(list)).toBe(list);
    expect(extractEventList({ events: list })).toBe(list);
  });
});
