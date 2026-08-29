import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateLanAddress } from "../dist/surge-transport.js";

test("Surge LAN target policy rejects public and cloud metadata addresses", () => {
  assert.equal(isPrivateLanAddress("192.168.50.10"), true);
  assert.equal(isPrivateLanAddress("10.0.0.1"), true);
  assert.equal(isPrivateLanAddress("100.64.0.1"), true);
  assert.equal(isPrivateLanAddress("169.254.1.2"), true);
  assert.equal(isPrivateLanAddress("169.254.169.254"), false);
  assert.equal(isPrivateLanAddress("192.0.2.10"), false);
  assert.equal(isPrivateLanAddress("8.8.8.8"), false);
  assert.equal(isPrivateLanAddress("fc00::1"), true);
  assert.equal(isPrivateLanAddress("fe80::1"), true);
  assert.equal(isPrivateLanAddress("::1"), false);
});
