import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRuntimeMetrics, uptimeFromTraffic } from "../dist/runtime-metrics.js";

test("parses Surge prometheus runtime metrics", () => {
  const parsed = parseRuntimeMetrics(`# HELP surge_uptime_seconds Engine uptime\n# TYPE surge_uptime_seconds gauge\nsurge_uptime_seconds 12345\nsurge_memory_bytes 104857600\nsurge_active_requests 12\nsurge_dns_cache_entries 321\nsurge_active_bans 2\n`);
  assert.deepEqual(parsed, {
    uptimeSeconds: 12345,
    memoryBytes: 104857600,
    activeRequests: 12,
    dnsCacheEntries: 321,
    activeBans: 2,
  });
});

test("accepts labeled prometheus lines and ignores unrelated metrics", () => {
  const parsed = parseRuntimeMetrics(`surge_build_info{version="6.9.0",build="1",system="macOS"} 1\nsurge_uptime_seconds 60\nsurge_memory_bytes 2048\nsurge_policy_in_bytes_total{policy="Proxy"} 999\n`);
  assert.equal(parsed.uptimeSeconds, 60);
  assert.equal(parsed.memoryBytes, 2048);
  assert.equal(parsed.activeRequests, null);
});

test("rejects prometheus payloads without supported runtime metrics", () => {
  assert.throws(
    () => parseRuntimeMetrics("# only comments\nother_metric 1\n"),
    (error) => error?.code === "runtime_metrics_parse_error",
  );
});

test("derives uptime from traffic startTime in seconds or milliseconds", () => {
  const sampledAt = Date.UTC(2026, 7, 25, 12, 0, 0);
  const startMs = sampledAt - 90_000;
  assert.equal(uptimeFromTraffic(JSON.stringify({ startTime: Math.floor(startMs / 1000) }), sampledAt), 90);
  assert.equal(uptimeFromTraffic(JSON.stringify({ startTime: startMs }), sampledAt), 90);
  assert.equal(uptimeFromTraffic("{}", sampledAt), null);
});
