import assert from "node:assert/strict";
import { test } from "node:test";
import { providerBackoffRemainingMs } from "../dist/notification-backoff.js";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

function attempt(status, secondsAgo) {
  return { status, createdAt: new Date(NOW - secondsAgo * 1000).toISOString() };
}

test("provider backoff grows with consecutive failures", () => {
  assert.equal(providerBackoffRemainingMs([attempt("error", 10)], NOW), 20_000);
  assert.equal(providerBackoffRemainingMs([attempt("error", 10), attempt("error", 40)], NOW), 50_000);
  assert.equal(providerBackoffRemainingMs([attempt("error", 10), attempt("error", 40), attempt("error", 80)], NOW), 110_000);
});

test("successful delivery resets provider failure streak", () => {
  assert.equal(
    providerBackoffRemainingMs([attempt("sent", 5), attempt("error", 10), attempt("error", 40)], NOW),
    0,
  );
});

test("expired provider backoff returns zero", () => {
  assert.equal(providerBackoffRemainingMs([attempt("error", 40)], NOW), 0);
});
