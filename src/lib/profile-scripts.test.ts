import { describe, expect, it } from "vitest";
import { parseScriptsFromProfile } from "./profile-scripts";

const SAMPLE = `[General]
loglevel = notify

[Proxy]
HK 01 = ss, 1.2.3.4, 8388

[Script]
ad-block = type=http-response, requires-body=true, script-path=scripts/ad-block.js
cron-job = cron, script-path=scripts/cron.js
legacy = http-response scripts/legacy.js
# commented = http-response scripts/skip.js

[Rule]
DOMAIN-SUFFIX,apple.com,DIRECT
`;

describe("parseScriptsFromProfile (T11)", () => {
  it("parses type= / script-path= params", () => {
    const scripts = parseScriptsFromProfile(SAMPLE);
    expect(scripts).toHaveLength(3);
    expect(scripts[0]).toMatchObject({
      name: "ad-block",
      type: "http-response",
      path: "scripts/ad-block.js",
      source: "profile",
    });
  });

  it("parses bare 'type path' syntax", () => {
    const scripts = parseScriptsFromProfile(SAMPLE);
    expect(scripts[2]).toMatchObject({ name: "legacy", type: "http-response", path: "scripts/legacy.js" });
  });

  it("ignores commented lines and other sections", () => {
    const scripts = parseScriptsFromProfile(SAMPLE);
    expect(scripts.some((s) => s.name === "skip")).toBe(false);
    expect(scripts.some((s) => s.name === "HK 01")).toBe(false);
  });

  it("defaults type to 'script' when undeclared", () => {
    const [s] = parseScriptsFromProfile("[Script]\nfoo = scripts/foo.js");
    expect(s).toMatchObject({ name: "foo", type: "script", path: "scripts/foo.js" });
  });

  it("returns [] for empty or script-less profiles", () => {
    expect(parseScriptsFromProfile("[General]\nloglevel = notify")).toEqual([]);
    expect(parseScriptsFromProfile("")).toEqual([]);
  });
});
