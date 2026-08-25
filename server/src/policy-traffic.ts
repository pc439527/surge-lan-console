export interface PolicyTrafficCounter {
  name: string;
  downloadBytes: number;
  uploadBytes: number;
}

export function parsePolicyTrafficMetrics(body: Buffer | string): PolicyTrafficCounter[] {
  const text = typeof body === "string" ? body : body.toString("utf8");
  const counters = new Map<string, PolicyTrafficCounter>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^surge_policy_(in|out)_bytes_total\{([^}]*)\}\s+([^\s]+)(?:\s+\d+)?$/);
    if (!match) continue;
    const name = policyLabel(match[2] ?? "");
    const value = Number(match[3]);
    if (!name || !Number.isFinite(value) || value < 0) continue;

    const counter = counters.get(name) ?? { name, downloadBytes: 0, uploadBytes: 0 };
    if (match[1] === "in") counter.downloadBytes = value;
    else counter.uploadBytes = value;
    counters.set(name, counter);
  }

  return [...counters.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function policyLabel(labels: string): string | null {
  const match = labels.match(/(?:^|,)\s*policy="((?:\\.|[^"\\])*)"(?:,|$)/);
  if (!match) return null;
  return unescapePrometheusLabel(match[1] ?? "").trim() || null;
}

function unescapePrometheusLabel(value: string): string {
  return value.replace(/\\([\\"n])/g, (_whole, escaped: string) => {
    if (escaped === "n") return "\n";
    return escaped;
  });
}
