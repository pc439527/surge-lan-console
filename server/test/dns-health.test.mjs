import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DNS_HEALTH_DOMAIN,
  dnsHealthDomainFromConfig,
  parseDnsDelayMs,
} from "../dist/dns-health.js";

test("parseDnsDelayMs accepts milliseconds and fractional seconds", () => {
  assert.equal(parseDnsDelayMs(Buffer.from('{"delay":42}')), 42);
  assert.equal(parseDnsDelayMs(Buffer.from('{"latency":0.125}')), 125);
  assert.equal(parseDnsDelayMs(Buffer.from('{"result":"88ms"}')), 88);
  assert.equal(parseDnsDelayMs(Buffer.from('{"data":{"timeCost":"0.2s"}}')), 200);
});

test("parseDnsDelayMs ignores unrelated numeric fields", () => {
  assert.throws(
    () => parseDnsDelayMs(Buffer.from('{"code":0,"status":200}')),
    (error) => error?.code === "dns_delay_parse_error",
  );
});

test("dns health domain config is bounded and safe", () => {
  assert.equal(dnsHealthDomainFromConfig('{"domain":"example.com"}'), "example.com");
  assert.equal(dnsHealthDomainFromConfig('{"domain":" https://example.com "}'), DEFAULT_DNS_HEALTH_DOMAIN);
  assert.equal(dnsHealthDomainFromConfig('{broken'), DEFAULT_DNS_HEALTH_DOMAIN);
});
