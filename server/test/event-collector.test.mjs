import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSurgeEvents } from "../dist/event-collector.js";

test("event collector parses real Surge numeric event types", () => {
  const events = parseSurgeEvents(JSON.stringify({
    events: [
      { identifier: "info-1", date: "2026-08-25T10:00:00Z", type: 0, content: "Info" },
      { identifier: "warn-1", date: "2026-08-25T10:01:00Z", type: 1, content: "Warning" },
      { identifier: "error-1", date: "2026-08-25T10:02:00Z", type: 2, content: "Error" },
    ],
  }));

  assert.equal(events.length, 3);
  assert.equal(events[0].severity, null);
  assert.equal(events[1].severity, "warning");
  assert.equal(events[2].severity, "error");
  assert.equal(events[2].key, "id:error-1");
});

test("event collector supports string event types and bare arrays", () => {
  const events = parseSurgeEvents(JSON.stringify([
    { type: "2", date: 1787652000, content: "Numeric string type" },
  ]));

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 2);
  assert.equal(events[0].severity, "error");
  assert.match(events[0].key, /^hash:[0-9a-f]{32}$/);
});

test("event collector rejects unknown envelopes", () => {
  assert.throws(
    () => parseSurgeEvents(JSON.stringify({ data: [] })),
    (error) => error?.code === "events_parse_error",
  );
});
