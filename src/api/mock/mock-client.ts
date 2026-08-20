import type {
  DnsCacheEntry,
  DnsResult,
  EventList,
  FeatureState,
  GroupTestResult,
  ModuleInfo,
  Modules,
  OutboundMode,
  Policies,
  PolicyGroupTestResults,
  PolicyGroups,
  ProfileInfo,
  RequestItem,
  RuleInfo,
  Scriptings,
  Traffic,
  TrafficSummary,
} from "@/api/types";

export interface TestConnectionResult {
  reachable: boolean;
  authenticated: boolean;
  latencyMs: number | null;
  error?: unknown;
}

let tick = 0;

function rand(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POLICY_NAMES = ["HK 01", "HK 02", "JP Tokyo", "SG", "US LA", "HK 05"];

const POLICY_GROUPS_DATA: PolicyGroups = {
  Proxy: POLICY_NAMES.map((name) => ({ name, typeDescription: "ss", lineHash: "hash-" + name })),
  Final: [{ name: "DIRECT", typeDescription: "direct" }],
  Streaming: POLICY_NAMES.slice(0, 3).map((name) => ({ name, typeDescription: "ss" })),
};

const MOCK_PROFILE_TEXT = `[General]
loglevel = notify
interface = 127.0.0.1

[Proxy]
HK 01 = ss, 1.2.3.4, 8388, encrypt-method=aes-128-gcm, password=****
HK 02 = ss, 1.2.3.5, 8388, encrypt-method=aes-128-gcm, password=****

[Proxy Group]
Proxy = select, HK 01, HK 02, JP Tokyo, SG, US LA, HK 05

[Rule]
DOMAIN-SUFFIX,apple.com,DIRECT
GEOIP,CN,DIRECT
FINAL,Proxy
`;

/**
 * In-memory Surge stand-in for development, demos and E2E.
 * Enabled only through an explicit dev/demo flag — never in production.
 */
export class MockSurgeClient {
  private outboundMode: OutboundMode = "rule";
  private features: FeatureState = { mitm: true, rewrite: true, scripting: true, capture: false };
  private moduleNames = ["Advertising Block", "YouTube", "Quic Fix"];
  private enabledModules = ["Advertising Block", "Quic Fix"];

  async testConnection(): Promise<TestConnectionResult> {
    return { reachable: true, authenticated: true, latencyMs: 18 };
  }

  async getFeatures(): Promise<FeatureState> {
    return { ...this.features };
  }

  async setFeature(feature: keyof FeatureState, enabled: boolean): Promise<void> {
    this.features = { ...this.features, [feature]: enabled };
  }

  async getOutboundMode(): Promise<OutboundMode> {
    return this.outboundMode;
  }

  async setOutboundMode(mode: OutboundMode): Promise<void> {
    this.outboundMode = mode;
  }

  async getGlobalOutboundPolicy(): Promise<string> {
    return "Proxy";
  }

  async getPolicies(): Promise<Policies> {
    return { "policy-groups": Object.keys(POLICY_GROUPS_DATA), proxies: POLICY_NAMES };
  }

  async getPolicyGroups(): Promise<PolicyGroups> {
    return Object.fromEntries(
      Object.entries(POLICY_GROUPS_DATA).map(([k, v]) => [k, v.map((p) => ({ ...p }))]),
    );
  }

  async getGroupSelection(groupName: string): Promise<string> {
    return POLICY_GROUPS_DATA[groupName]?.[0]?.name ?? "";
  }

  async selectPolicy(groupName: string, policyName: string): Promise<void> {
    // mock keeps a selected pointer in a copy
    this.groupSelections[groupName] = policyName;
  }

  private groupSelections: Record<string, string> = {
    Proxy: "HK 01",
    Final: "DIRECT",
    Streaming: "HK 02",
  };

  async testPolicyGroup(groupName: string): Promise<GroupTestResult> {
    const group = POLICY_GROUPS_DATA[groupName];
    return { available: group?.map((p) => p.name) ?? [] };
  }

  async testPolicies(): Promise<void> {
    /* no-op */
  }

  async getPolicyTestResults(): Promise<PolicyGroupTestResults> {
    const latencies: Record<string, number> = {
      "HK 01": 42,
      "HK 02": 61,
      "JP Tokyo": 72,
      "SG": 95,
      "US LA": 168,
      "HK 05": 420,
      "DIRECT": 0,
    };
    return Object.fromEntries(
      Object.entries(POLICY_GROUPS_DATA).map(([group, policies]) => [
        group,
        Object.fromEntries(
          policies.map((p) => [
            p.name,
            latencies[p.name] != null
              ? { ok: true, latency: latencies[p.name] }
              : { ok: false, latency: "Timeout" },
          ]),
        ),
      ]),
    );
  }

  async getRecentRequests(): Promise<RequestItem[]> {
    const rnd = rand(tick++);
    const now = Date.now();
    const hosts = ["api.github.com", "fonts.googleapis.com", "registry.npmjs.org", "www.apple.com"];
    return Array.from({ length: 12 }, (_, i) => {
      const host = hosts[Math.floor(rnd() * hosts.length)];
      return {
        id: i + 1,
        remoteAddress: "192.168.50.3:54321",
        URL: `https://${host}/${Math.floor(rnd() * 999)}`,
        method: ["GET", "POST", "HEAD"][Math.floor(rnd() * 3)],
        policyName: POLICY_NAMES[Math.floor(rnd() * (POLICY_NAMES.length - 1))],
        rule: `DOMAIN-SUFFIX,${host.split(".").slice(-2).join(".")}`,
        status: i % 4 === 0 ? "Active" : "Completed",
        failed: false,
        completed: true,
        modified: false,
        replica: false,
        pid: 0,
        sourcePort: 54321,
        sourceAddress: "192.168.50.3",
        localAddress: "192.168.50.10",
        startDate: now - i * 1370,
        completedDate: now - i * 1370 + 400,
        setupCompletedDate: now - i * 1370 + 200,
        inBytes: Math.floor(rnd() * 8000),
        outBytes: Math.floor(rnd() * 2000),
        inCurrentSpeed: 0,
        outCurrentSpeed: 0,
        inMaxSpeed: 0,
        outMaxSpeed: 0,
      };
    });
  }

  async getActiveRequests(): Promise<RequestItem[]> {
    return (await this.getRecentRequests()).slice(0, 3);
  }

  async killRequest(): Promise<void> {
    /* no-op */
  }

  async getTraffic(): Promise<Traffic> {
    const rnd = rand(tick++);
    return {
      startTime: Date.now() / 1000,
      interface: {
        pdp_ip0: {
          inCurrentSpeed: Math.floor(rnd() * 12000 + 2000),
          outCurrentSpeed: Math.floor(rnd() * 5000 + 500),
          in: Math.floor(rnd() * 1e9 + 5e9),
          out: Math.floor(rnd() * 1e9 + 2e9),
          inMaxSpeed: 0,
          outMaxSpeed: 0,
        },
        en0: {
          inCurrentSpeed: 0,
          outCurrentSpeed: 0,
          in: 0,
          out: 0,
          inMaxSpeed: 0,
          outMaxSpeed: 0,
        },
      },
      connector: {},
    };
  }

  async getTrafficSummary(): Promise<TrafficSummary> {
    const t = await this.getTraffic();
    const summary = { uploadRate: 0, downloadRate: 0, totalUpload: 0, totalDownload: 0 };
    for (const name in t.interface) {
      summary.uploadRate += t.interface[name].outCurrentSpeed ?? 0;
      summary.downloadRate += t.interface[name].inCurrentSpeed ?? 0;
      summary.totalUpload += t.interface[name].out ?? 0;
      summary.totalDownload += t.interface[name].in ?? 0;
    }
    return summary;
  }

  async getEvents(): Promise<EventList> {
    const pool = [
      [0, "Profile reloaded"],
      [1, "Rule set ChinaMax_All.list load failed"],
      [2, "Connection refused (POSIX:61)"],
      [0, "DNS cache flushed"],
      [1, "Script \"ad-block\" execution took 320ms"],
      [0, "Outbound mode changed to Rule"],
      [2, "TLS handshake failed with apple.com"],
    ] as const;
    const now = Date.now();
    return {
      events: pool.map(([type, content], i) => ({
        identifier: `evt-${i}`,
        date: new Date(now - i * 45000).toISOString(),
        type,
        allowDismiss: 1,
        content,
      })),
    };
  }

  async getRules(): Promise<RuleInfo[]> {
    return [
      { type: "DOMAIN-SUFFIX", content: "apple.com", policy: "DIRECT" },
      { type: "DOMAIN-SUFFIX", content: "github.com", policy: "Proxy" },
      { type: "IP-CIDR", content: "10.0.0.0/8", policy: "DIRECT" },
      { type: "GEOIP", content: "CN", policy: "DIRECT" },
      { type: "FINAL", content: "", policy: "Proxy" },
    ];
  }

  async getDnsCache(): Promise<DnsResult> {
    return {
      local: [],
      dnsCache: [
        { domain: "api.github.com", data: ["192.0.2.6"], server: "system", path: "", timeCost: 12, expiresTime: Date.now() + 42000 },
        { domain: "www.apple.com", data: ["198.51.100.17"], server: "system", path: "", timeCost: 8, expiresTime: Date.now() + 210000 },
      ],
    };
  }

  async getDnsCacheEntries(): Promise<DnsCacheEntry[]> {
    return (await this.getDnsCache()).dnsCache;
  }

  async flushDns(): Promise<void> {
    /* no-op */
  }

  async testDnsDelay(): Promise<unknown> {
    return { delay: 42 };
  }

  async getModules(): Promise<Modules> {
    return { enabled: [...this.enabledModules], available: [...this.moduleNames] };
  }

  async getModuleList(): Promise<ModuleInfo[]> {
    return this.moduleNames.map((name) => ({ name, enabled: this.enabledModules.includes(name) }));
  }

  async updateModule(name: string, enabled: boolean): Promise<void> {
    if (enabled) {
      if (!this.enabledModules.includes(name)) this.enabledModules.push(name);
    } else {
      this.enabledModules = this.enabledModules.filter((n) => n !== name);
    }
  }

  async getScripts(): Promise<Scriptings> {
    return {
      scripts: [
        { name: "ad-block", type: "http-response", path: "scripts/ad-block.js" },
        { name: "cron-job", type: "cron", path: "scripts/cron.js" },
        { name: "dns-resolver", type: "dns", path: "scripts/dns.js" },
      ],
    };
  }

  async getScriptList() {
    return (await this.getScripts()).scripts;
  }

  async evaluateScript(): Promise<unknown> {
    return { result: "evaluated", output: "ok" };
  }

  async runCronScript(): Promise<unknown> {
    return { result: "cron run", output: "ok" };
  }

  async getCurrentProfile(): Promise<ProfileInfo> {
    return { name: "Profile.conf", profile: MOCK_PROFILE_TEXT, originalProfile: MOCK_PROFILE_TEXT };
  }

  async reloadProfile(): Promise<void> {
    /* no-op */
  }

  async getMetrics(): Promise<string> {
    return "# mock metrics";
  }
}