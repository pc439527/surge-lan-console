import type { CapabilityFeature, CapabilityReport, SurgePlatform } from "@/api/capability";

export interface DeviceCapabilities {
  platform: SurgePlatform;
  label: string;
  features: Record<CapabilityFeature, boolean>;
  reasons: Partial<Record<CapabilityFeature, string>>;
}

const LABEL: Record<SurgePlatform, string> = { macos: "Surge macOS", ios: "Surge iOS", tvos: "Apple TV / tvOS", unknown: "Surge 实例" };
const ALL: CapabilityFeature[] = ["traffic", "requests", "policies", "dns", "rules", "modules", "scripts", "events"];

/** Unknown and transient states stay visible; only explicit API rejection disables a feature. */
export function resolveDeviceCapabilities(report?: CapabilityReport): DeviceCapabilities {
  const features = {} as Record<CapabilityFeature, boolean>;
  const reasons: Partial<Record<CapabilityFeature, string>> = {};
  for (const feature of ALL) {
    const unsupported = report?.features[feature] === "unsupported";
    features[feature] = !unsupported;
    if (unsupported) reasons[feature] = LABEL[report?.platform ?? "unknown"] + " 未开放该 API";
  }
  const platform = report?.platform ?? "unknown";
  return { platform, label: LABEL[platform], features, reasons };
}
