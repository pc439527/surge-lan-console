import { CloudOff } from "lucide-react";
import { useCapabilitiesQuery } from "./capability";
import {
  FEATURE_LABEL,
  PLATFORM_LABEL,
  supportedFeatures,
  unsupportedFeatures,
  type CapabilityFeature,
} from "@/api/capability";

/**
 * CapabilityNotice（v0.3.0）—— 能力探测确认某平台未开放某 API 时，
 * 在页面顶部给出解释，而不是让用户看到孤零零的“不支持”错误。
 *
 * 仅当能力报告已确认 unsupported 才渲染；探测中 / unknown / unreachable
 * 一律不渲染（页面走自己的加载与错误态）。
 */
export function CapabilityNotice({ feature, api }: { feature: CapabilityFeature; api: string }) {
  const { data } = useCapabilitiesQuery();
  if (!data || data.features[feature] !== "unsupported") return null;

  const supported = supportedFeatures(data);
  const unsupported = unsupportedFeatures(data);
  const supportedText = supported.length ? supported.map((f) => FEATURE_LABEL[f]).join(" · ") : "—";
  const unsupportedText = unsupported.length ? unsupported.map((f) => FEATURE_LABEL[f]).join(" · ") : "—";

  return (
    <div className="rounded-sm border border-warning/30 bg-warning/8 p-4">
      <div className="flex items-start gap-3">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-medium text-text-primary">
            {PLATFORM_LABEL[data.platform]} 未开放 {FEATURE_LABEL[feature]} API
          </p>
          <p className="text-xs leading-relaxed text-text-secondary">
            {api} 返回 404/405，能力探测已确认该平台不支持此接口。支持的功能：{supportedText}；
            不支持：{unsupportedText}。
          </p>
          <p className="text-xs text-text-tertiary">
            可在「设置 → API 诊断」查看各接口原始响应；若判定有误，可在连接设置中手动指定平台。
          </p>
        </div>
      </div>
    </div>
  );
}
