import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePolicyTrafficMetrics } from "../dist/policy-traffic.js";

test("parses per-policy prometheus traffic counters", () => {
  const rows = parsePolicyTrafficMetrics(`
surge_policy_in_bytes_total{policy="Proxy"} 1024
surge_policy_out_bytes_total{policy="Proxy"} 512
surge_policy_in_bytes_total{policy="DIRECT"} 2048
surge_policy_out_bytes_total{policy="DIRECT"} 128
`);
  assert.deepEqual(rows, [
    { name: "DIRECT", downloadBytes: 2048, uploadBytes: 128 },
    { name: "Proxy", downloadBytes: 1024, uploadBytes: 512 },
  ]);
});

test("parses escaped policy labels and ignores unrelated metrics", () => {
  const rows = parsePolicyTrafficMetrics(`
surge_uptime_seconds 100
surge_policy_in_bytes_total{policy="My \\"Proxy\\""} 100
surge_policy_out_bytes_total{policy="My \\"Proxy\\""} 50
surge_interface_in_bytes_total{interface="en0"} 999
`);
  assert.deepEqual(rows, [{ name: 'My "Proxy"', downloadBytes: 100, uploadBytes: 50 }]);
});

test("returns empty list when policy counters are unavailable", () => {
  assert.deepEqual(parsePolicyTrafficMetrics("surge_uptime_seconds 100\n"), []);
});
