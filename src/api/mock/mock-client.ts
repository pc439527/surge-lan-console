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

// ── Request seeds (Request Inspector V2) ────────────────────────
//
// Each seed models a real Surge row from the Apple TV screenshot:
// `method` is the app protocol, `remoteAddress` may carry a "(Port Map)"
// annotation, and HTTP rows carry a raw requestHeader block. The
// classifier in src/lib/request.ts must produce the badges shown below.

interface MockRequestSeed {
  method: string;
  protocol?: string;
  hostname: string;
  url: string;
  remoteAddress: string;
  destPort?: number;
  status: "Active" | "Completed";
  rule: string;
  policyName: string;
  requestHeader?: string;
  notes?: string[];
  timing?: Array<{ name: string; durationInMillisecond: number }>;
  processPath?: string;
  pid?: number;
  inBytes: number;
  outBytes: number;
}

const MOCK_REQUEST_SEEDS: MockRequestSeed[] = [
  {
    method: "HTTPS",
    hostname: "api-docs.deepseek.com",
    url: "https://api-docs.deepseek.com/openapi.json",
    remoteAddress: "192.0.2.10:443",
    status: "Completed",
    rule: "DOMAIN-SUFFIX,deepseek.com",
    policyName: "Test Proxy 02",
    requestHeader: ["GET /openapi.json HTTP/1.1", "Host: api-docs.deepseek.com", "User-Agent: DeepSeek-CLI/0.23.1", "Accept: application/json"].join("\n"),
    notes: ["[Rule] Rule evaluating...", "[DNS] Use 203.0.113.53 for lookup", "[MITM] Decrypted using CA certificate"],
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 7 },
      { name: "DNS Lookup", durationInMillisecond: 12 },
      { name: "Connecting", durationInMillisecond: 11 },
      { name: "TLS Handshake", durationInMillisecond: 6 },
      { name: "Transfer", durationInMillisecond: 8 },
    ],
    processPath: "/usr/bin/curl",
    pid: 2891,
    inBytes: 1_618,
    outBytes: 203_020,
  },
  {
    method: "HTTPS",
    hostname: "api.deepseek.com",
    url: "https://api.deepseek.com/v1/chat/completions",
    remoteAddress: "198.51.100.10:443",
    status: "Completed",
    rule: "DOMAIN-SUFFIX,deepseek.com",
    policyName: "Test Proxy 02",
    requestHeader: ["POST /v1/chat/completions HTTP/1.1", "Host: api.deepseek.com", "Content-Type: application/json", "Authorization: Bearer sk-***", "User-Agent: DeepSeek-CLI/0.23.1"].join("\n"),
    notes: ["[Script] ad-block: pass", "[Rewrite] skip: not matched"],
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 5 },
      { name: "DNS Lookup", durationInMillisecond: 9 },
      { name: "Connecting", durationInMillisecond: 24 },
      { name: "TLS Handshake", durationInMillisecond: 18 },
      { name: "Transfer", durationInMillisecond: 640 },
    ],
    processPath: "/usr/bin/curl",
    pid: 2891,
    inBytes: 84_210,
    outBytes: 2_048_000,
  },
  {
    method: "GET",
    hostname: "example.com",
    url: "http://example.com/index.html",
    remoteAddress: "93.184.216.34:80",
    status: "Completed",
    rule: "DOMAIN-SUFFIX,example.com",
    policyName: "DIRECT",
    requestHeader: ["GET /index.html HTTP/1.1", "Host: example.com", "User-Agent: curl/8.4.0", "Accept: */*"].join("\n"),
    notes: ["[Rule] Rule evaluating...", "[HTTP] Direct connect"],
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 3 },
      { name: "DNS Lookup", durationInMillisecond: 6 },
      { name: "Connecting", durationInMillisecond: 9 },
      { name: "Transfer", durationInMillisecond: 42 },
    ],
    inBytes: 1_970,
    outBytes: 12_480,
  },
  {
    method: "UDP",
    hostname: "203.0.113.53",
    url: "203.0.113.53:53",
    remoteAddress: "203.0.113.53:53 (Port Map)",
    destPort: 53,
    status: "Completed",
    rule: "DNS",
    policyName: "DIRECT",
    notes: ["[Rule] Rule evaluating...", "[DNS] Use 203.0.113.53 for lookup"],
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 2 },
      { name: "DNS Lookup", durationInMillisecond: 11 },
      { name: "Transfer", durationInMillisecond: 1 },
    ],
    inBytes: 210,
    outBytes: 96,
  },
  {
    method: "UDP",
    hostname: "192.168.50.53",
    url: "192.168.50.53:53",
    remoteAddress: "192.168.50.53:53 (Port Map)",
    destPort: 53,
    status: "Completed",
    rule: "DNS",
    policyName: "DIRECT",
    notes: ["[DNS] Local network resolver"],
    timing: [{ name: "Rule Evaluating", durationInMillisecond: 1 }, { name: "Transfer", durationInMillisecond: 4 }],
    inBytes: 118,
    outBytes: 102,
  },
  {
    method: "TCP",
    hostname: "mail.example.com",
    url: "mail.example.com:993",
    remoteAddress: "203.0.113.7:993",
    destPort: 993,
    status: "Completed",
    rule: "DOMAIN-SUFFIX,example.com",
    policyName: "JP Tokyo",
    notes: ["[Rule] Rule evaluating...", "[Proxy] Tunnel established"],
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 4 },
      { name: "DNS Lookup", durationInMillisecond: 8 },
      { name: "Connecting", durationInMillisecond: 22 },
      { name: "Transfer", durationInMillisecond: 3_124 },
    ],
    processPath: "/Applications/Mail.app/Contents/MacOS/Mail",
    pid: 921,
    inBytes: 3_948,
    outBytes: 1_206,
  },
  {
    method: "UDP",
    hostname: "192.168.50.30",
    url: "192.168.50.30:514",
    remoteAddress: "192.168.50.30:514",
    destPort: 514,
    status: "Completed",
    rule: "IP-CIDR,192.168.50.0/24",
    policyName: "DIRECT",
    notes: ["[Rule] Rule evaluating..."],
    timing: [{ name: "Rule Evaluating", durationInMillisecond: 1 }, { name: "Transfer", durationInMillisecond: 2 }],
    inBytes: 512,
    outBytes: 64,
  },
  {
    method: "QUIC",
    protocol: "QUIC",
    hostname: "edge.example.com",
    url: "https://edge.example.com/video/stream.m3u8",
    remoteAddress: "192.0.2.14:443",
    destPort: 443,
    status: "Completed",
    rule: "DOMAIN-SUFFIX,example.com",
    policyName: "SG",
    notes: ["[Rule] Rule evaluating...", "[QUIC] 0-RTT session resumed"],
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 6 },
      { name: "DNS Lookup", durationInMillisecond: 10 },
      { name: "QUIC Handshake", durationInMillisecond: 14 },
      { name: "Transfer", durationInMillisecond: 92 },
    ],
    processPath: "/System/Library/PrivateFrameworks/CoreMediaPlayback.framework/XPCServices",
    pid: 412,
    inBytes: 4_182_400,
    outBytes: 51_280,
  },
  {
    method: "QUIC",
    hostname: "www.gstatic.com",
    url: "https://www.gstatic.com/generate_204",
    remoteAddress: "198.51.100.99:443",
    destPort: 443,
    status: "Completed",
    rule: "DOMAIN-SUFFIX,gstatic.com",
    policyName: "HK 01",
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 3 },
      { name: "DNS Lookup", durationInMillisecond: 7 },
      { name: "QUIC Handshake", durationInMillisecond: 9 },
      { name: "Transfer", durationInMillisecond: 14 },
    ],
    inBytes: 0,
    outBytes: 88,
  },
  {
    method: "UDP",
    hostname: "stun.example.com",
    url: "stun.example.com:3478",
    remoteAddress: "203.0.113.127:3478",
    destPort: 3478,
    status: "Completed",
    rule: "DOMAIN-SUFFIX,example.com",
    policyName: "HK 02",
    notes: ["[Rule] Rule evaluating...", "[STUN] Binding request"],
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 2 },
      { name: "DNS Lookup", durationInMillisecond: 5 },
      { name: "Transfer", durationInMillisecond: 12 },
    ],
    inBytes: 96,
    outBytes: 96,
  },
  {
    method: "WSS",
    hostname: "stream.example.com",
    url: "wss://stream.example.com/socket",
    remoteAddress: "203.0.113.30:443",
    status: "Completed",
    rule: "DOMAIN-SUFFIX,example.com",
    policyName: "HK 01",
    requestHeader: ["GET /socket HTTP/1.1", "Host: stream.example.com", "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ=="].join("\n"),
    notes: ["[Rule] Rule evaluating...", "[MITM] WebSocket decrypted"],
    timing: [
      { name: "Rule Evaluating", durationInMillisecond: 4 },
      { name: "DNS Lookup", durationInMillisecond: 8 },
      { name: "Connecting", durationInMillisecond: 13 },
      { name: "TLS Handshake", durationInMillisecond: 9 },
    ],
    inBytes: 302_100,
    outBytes: 12_040,
  },
];

/**
 * Render a seed into a RequestItem with live-ish timestamps and bytes.
 * `live` rows keep zeroed completion timestamps (still in flight).
 */
function mockRequestSeed(
  index: number,
  now: number,
  id: number,
  live: boolean,
  rnd: () => number = () => 0.5,
): RequestItem {
  const seed = MOCK_REQUEST_SEEDS[index % MOCK_REQUEST_SEEDS.length];
  const start = now - index * 1_370 - Math.floor(rnd() * 300);
  const duration = seed.timing?.reduce((sum, t) => sum + t.durationInMillisecond, 0) ?? 120;
  const variance = 0.85 + rnd() * 0.4;
  return {
    id,
    URL: seed.url,
    method: seed.method,
    protocol: seed.protocol,
    hostname: seed.hostname,
    destPort: seed.destPort,
    policyName: seed.policyName,
    rule: seed.rule,
    status: live ? "Active" : seed.status,
    startDate: start,
    completedDate: live ? 0 : start + Math.max(1, Math.round(duration * variance)),
    setupCompletedDate: live ? 0 : start + Math.max(1, Math.round(duration * 0.6 * variance)),
    sourceAddress: "192.168.50.20",
    sourcePort: 51_200 + index * 37,
    outBytes: Math.round(seed.outBytes * variance),
    inBytes: Math.round(seed.inBytes * variance),
    failed: false,
    completed: !live,
    modified: false,
    replica: false,
    remoteAddress: seed.remoteAddress,
    localAddress: "192.168.50.10",
    inCurrentSpeed: 0,
    outCurrentSpeed: 0,
    inMaxSpeed: Math.round(seed.inBytes * 0.3),
    outMaxSpeed: Math.round(seed.outBytes * 0.3),
    pid: seed.pid ?? 0,
    notes: seed.notes,
    requestHeader: seed.requestHeader,
    processPath: seed.processPath,
    timingRecords: seed.timing,
    lastUpdated: new Date(start).toISOString(),
  };
}

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

  /**
   * Raw endpoint probe for API Diagnostics (T01/T04) — the same surface
   * SurgeClient.probeEndpoint exposes, fed from the in-memory mock so the
   * Diagnostics page works in demo mode too.
   */
  async probeEndpoint(
    endpoint: string,
  ): Promise<{ status: number | null; latencyMs: number | null; raw: unknown; error?: unknown }> {
    const started = performance.now();
    // /v1/outbound 模拟真实往返延迟（18ms，与 testConnection 一致），
    // 供 Dashboard 延迟指标展示。
    const latencyMs =
      endpoint === "/v1/outbound" ? 18 : Math.max(1, Math.round(performance.now() - started));
    const responses: Record<string, unknown> = {
      "/v1/outbound": { mode: this.outboundMode },
      "/v1/traffic": await this.getTraffic(),
      "/v1/requests/recent": { requests: await this.getRecentRequests() },
      "/v1/policy_groups": await this.getPolicyGroups(),
      "/v1/rules": await this.getRules(),
      "/v1/dns": await this.getDnsCache(),
      "/v1/modules": await this.getModules(),
      "/v1/scripting": await this.getScripts(),
      "/v1/events": await this.getEvents(),
    };
    return {
      status: 200,
      latencyMs,
      raw: responses[endpoint] ?? null,
    };
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
    const allResults = await this.getPolicyTestResults();
    const results = allResults[groupName] ?? {};
    return { available: Object.keys(results).filter((name) => results[name].ok !== false), results };
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

  // ── Requests (Request Inspector V2 demo data, P0) ─────────────
  /**
   * Realistic Surge request semantics. `method` carries the app protocol
   * ("HTTPS" / "UDP" / "TCP" / "QUIC"), NOT an HTTP verb — this mirrors
   * real Apple TV / iOS payloads and keeps the protocol classifier honest
   * in dev mode (previously it mocked GET/POST/HEAD, which broke the
   * protocol pipeline exactly where it mattered).
   */
  private activePool: RequestItem[] = [];
  private nextMockId = 1000;

  /** Seed the persistent active-request pool once (kill actually works). */
  private ensureActivePool(): void {
    if (this.activePool.length > 0) return;
    const now = Date.now();
    this.activePool = [
      {
        ...mockRequestSeed(0, now, this.nextMockId++, true),
        status: "Active",
        completed: false,
        inCurrentSpeed: 152_000,
        outCurrentSpeed: 8_400,
        inMaxSpeed: 618_000,
        outMaxSpeed: 31_000,
      },
      {
        ...mockRequestSeed(3, now, this.nextMockId++, true),
        status: "Active",
        completed: false,
        inCurrentSpeed: 1_240,
        outCurrentSpeed: 890,
        inMaxSpeed: 12_000,
        outMaxSpeed: 9_500,
      },
      {
        ...mockRequestSeed(6, now, this.nextMockId++, true),
        status: "Active",
        completed: false,
        inCurrentSpeed: 3_120,
        outCurrentSpeed: 2_200,
        inMaxSpeed: 41_000,
        outMaxSpeed: 33_000,
      },
    ];
  }

  async getRecentRequests(): Promise<RequestItem[]> {
    this.ensureActivePool();
    const rnd = rand(tick++);
    const now = Date.now();
    const active = this.activePool.map((item) => ({ ...item }));
    const completed = MOCK_REQUEST_SEEDS.flatMap((seed, i) =>
      seed.status === "Active"
        ? []
        : [mockRequestSeed(i, now, this.nextMockId++, false, rnd)],
    );
    return [...active, ...completed];
  }

  async getActiveRequests(): Promise<RequestItem[]> {
    this.ensureActivePool();
    return this.activePool.map((item) => ({ ...item }));
  }

  /** POST /v1/requests/kill — drop the connection from the active pool. */
  async killRequest(id: number): Promise<void> {
    this.ensureActivePool();
    this.activePool = this.activePool.filter((item) => item.id !== id);
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
          inMaxSpeed: 37_450_000,
          outMaxSpeed: 760_720,
        },
        en0: {
          inCurrentSpeed: 0,
          outCurrentSpeed: 0,
          in: 2_912_000_000,
          out: 1_045_000_000,
          inMaxSpeed: 0,
          outMaxSpeed: 0,
        },
      },
      connector: {
        DIRECT: {
          outCurrentSpeed: 0,
          in: 5_912_000_000,
          inCurrentSpeed: 0,
          outMaxSpeed: 0,
          out: 3_045_000_000,
          inMaxSpeed: 0,
        },
        "HK 01": {
          outCurrentSpeed: Math.floor(rnd() * 3000 + 200),
          in: 2_100_000_000,
          inCurrentSpeed: Math.floor(rnd() * 8000 + 1000),
          outMaxSpeed: 760_720,
          out: 900_000_000,
          inMaxSpeed: 37_450_000,
        },
        "Test Proxy 03": {
          outCurrentSpeed: Math.floor(rnd() * 2500 + 400),
          in: 1_050_000_000,
          inCurrentSpeed: Math.floor(rnd() * 6000 + 900),
          outMaxSpeed: 650_000,
          out: 610_000_000,
          inMaxSpeed: 22_000_000,
        },
      },
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