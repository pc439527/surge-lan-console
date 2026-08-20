import { useQuery } from "@tanstack/react-query";
import { useSurgeClientState } from "@/app/surge-client-context";
import {
  probeCapabilities,
  type CapabilityFeature,
  type CapabilityReport,
} from "@/api/capability";
import { surgeKeys } from "@/lib/surge-keys";

/**
 * Capability Engine — React Query 接入层（v0.3.0）。
 *
 * 探测结果按 connectionId + 手动平台覆盖 命名空间缓存（staleTime 5 分钟、
 * 不轮询），Sidebar / Dashboard / 各页面共用同一份报告，连接切换后自动
 * 失效重建。
 *
 * 使用：
 *   const { data: report, isPending } = useCapabilitiesQuery();
 *   const status = useCapabilityFeature("modules"); // "supported" | ...
 */

export function useCapabilitiesQuery() {
  const { client, missingKey, connectionId, connection } = useSurgeClientState();
  return useQuery<CapabilityReport>({
    queryKey: surgeKeys.capability(connectionId, connection?.platform),
    queryFn: ({ signal }) => probeCapabilities(client!, connection?.platform, signal),
    enabled: !!client && !missingKey,
    staleTime: 5 * 60_000,
    refetchInterval: false,
    gcTime: 15 * 60_000,
  });
}

/** 某个功能的能力状态；未探测/加载中返回 "unknown"。 */
export function useCapabilityFeature(feature: CapabilityFeature): CapabilityReport["features"][CapabilityFeature] {
  const { data } = useCapabilitiesQuery();
  return data?.features[feature] ?? "unknown";
}

/** 该功能是否“确认不支持”（导航标记 / 页面空状态据此渲染）。 */
export function useCapabilityUnsupported(feature: CapabilityFeature): boolean {
  return useCapabilityFeature(feature) === "unsupported";
}
