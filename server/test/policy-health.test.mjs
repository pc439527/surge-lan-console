import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePolicyNodeHealth } from "../dist/policy-health.js";

test("policy health collapses the same node across groups", () => {
  const nodes = parsePolicyNodeHealth(JSON.stringify({
    Proxy: {
      "HK-01": { ok: true, latency: 42 },
      "JP-01": { ok: false, latency: "Timeout" },
    },
    Streaming: {
      "HK-01": { ok: true, latency: 58 },
      "JP-01": { ok: false, lastTestErrorMessage: "timeout" },
    },
  }));

  assert.equal(nodes.length, 2);
  const hk = nodes.find((node) => node.name === "HK-01");
  const jp = nodes.find((node) => node.name === "JP-01");

  assert.deepEqual(hk?.groups, ["Proxy", "Streaming"]);
  assert.equal(hk?.reachable, true);
  assert.equal(hk?.latencyMs, 50);
  assert.equal(jp?.reachable, false);
  assert.equal(jp?.latencyMs, null);
});

test("policy health accepts numeric strings and receive metrics", () => {
  const nodes = parsePolicyNodeHealth(JSON.stringify({
    Auto: {
      "SG-01": { receive: "66" },
    },
  }));

  assert.equal(nodes[0]?.reachable, true);
  assert.equal(nodes[0]?.latencyMs, 66);
});

test("policy health rejects invalid payloads", () => {
  assert.throws(
    () => parsePolicyNodeHealth("[]"),
    (error) => error?.code === "policy_health_parse_error",
  );
});
