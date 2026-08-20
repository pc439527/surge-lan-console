import type { PolicyTestEntry } from "@/api/types";
import { latencyTone } from "./latency";

/** Derive the protocol (http/https/ws/wss/…) from a request URL. */
export function requestProtocol(url: string): string {
  try {
    const scheme = new URL(url).protocol.replace(":", "").toLowerCase();
    return scheme || "unknown";
  } catch {
    return "unknown";
  }
}

/** Normalize a policy test latency to ms, or null when unknown/failed. */
export function policyLatencyMs(entry: PolicyTestEntry | undefined): number | null {
  if (!entry || entry.ok === false) return null;
  const raw = entry.latency;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface PolicyLatencyView {
  tone: "success" | "warning" | "danger" | "muted";
  label: string;
}

/** §6.3 grading: <100 green, 100–250 orange, >250 red, timeout/unknown gray. */
export function policyLatencyView(entry: PolicyTestEntry | undefined): PolicyLatencyView {
  const ms = policyLatencyMs(entry);
  if (ms === null) {
    // ok:false after a test reads as a timeout; an absent entry as unknown.
    if (entry?.ok === true) return { tone: "success", label: "可达" };
    return entry && entry.ok === false ? { tone: "muted", label: "超时" } : { tone: "muted", label: "—" };
  }
  return { tone: latencyTone(ms), label: `${Math.round(ms)}ms` };
}
