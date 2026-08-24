import { cn } from "@/lib/cn";
import type { RequestAppProtocol } from "@/lib/request";

/**
 * Text-only protocol badge (Request Inspector V2).
 *
 * The protocol is already an abbreviation — an icon/image would force the
 * user to re-learn meaning and complicates scaling, Dark/Light and HiDPI.
 * The badge is the label itself, tinted by a semantic token so the palette
 * stays theme-aware (no hardcoded colors — AGENTS.md §4).
 */
const PROTOCOL_BADGE_CLASSES: Record<RequestAppProtocol, string> = {
  // 蓝灰
  HTTP: "border-proto-http/25 bg-proto-http/12 text-proto-http",
  // 蓝色
  HTTPS: "border-proto-https/25 bg-proto-https/12 text-proto-https",
  // 紫色
  TCP: "border-proto-tcp/25 bg-proto-tcp/12 text-proto-tcp",
  // 青色
  UDP: "border-proto-udp/25 bg-proto-udp/12 text-proto-udp",
  // 靛蓝
  QUIC: "border-proto-quic/25 bg-proto-quic/12 text-proto-quic",
  // 橙色
  DNS: "border-proto-dns/25 bg-proto-dns/12 text-proto-dns",
  // 紫红
  STUN: "border-proto-stun/25 bg-proto-stun/12 text-proto-stun",
  // 蓝紫
  WS: "border-proto-ws/25 bg-proto-ws/12 text-proto-ws",
  WSS: "border-proto-wss/25 bg-proto-wss/12 text-proto-wss",
  // 灰色
  UNKNOWN: "border-proto-unknown/25 bg-proto-unknown/10 text-proto-unknown",
};

export function ProtocolBadge({
  app,
  className,
}: {
  app: RequestAppProtocol;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide",
        PROTOCOL_BADGE_CLASSES[app],
        className,
      )}
    >
      {app}
    </span>
  );
}