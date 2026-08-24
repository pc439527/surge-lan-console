import type { OutboundMode, TrafficSummary } from "@/api/types";

export type SurgePlatform = "ios" | "tvos" | "macos" | "unknown";
export type SurgeDeviceStatus = "online" | "offline";

/** Canonical device view model shared by Fleet, Dashboard and Health. */
export interface SurgeDevice {
  id: string;
  name: string;
  platform: SurgePlatform;
  address: string;
  status: SurgeDeviceStatus;
  apiLatency: number | null;
  capabilities: { rules: boolean; modules: boolean; scripts: boolean };
  traffic: Pick<TrafficSummary, "uploadRate" | "downloadRate">;
  lastCheck: string;
  outboundMode?: OutboundMode | null;
}

export function platformLabel(platform: SurgePlatform): string {
  return { ios: "iOS", tvos: "tvOS", macos: "macOS", unknown: "Unknown" }[platform];
}
