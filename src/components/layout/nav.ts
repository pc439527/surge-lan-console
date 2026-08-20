import {
  Activity,
  Cable,
  Code2,
  Gauge,
  GitBranch,
  Globe,
  ListOrdered,
  Network,
  Radar,
  Plug,
  ScrollText,
  Settings,
  Shield,
  Stethoscope,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { CapabilityFeature } from "@/api/capability";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 关联的 Surge API 能力；探测确认不支持时导航会标记「不可用」。 */
  feature?: CapabilityFeature;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "概览",
    items: [
      { to: "/", label: "仪表盘", icon: Gauge },
      { to: "/fleet", label: "Fleet Console", icon: Network },
    ],
  },
  {
    title: "网络",
    items: [
      { to: "/policies", label: "策略", icon: GitBranch, feature: "policies" },
      { to: "/node-quality", label: "节点质量", icon: Radar, feature: "policies" },
      { to: "/requests", label: "请求", icon: ListOrdered, feature: "requests" },
      { to: "/traffic", label: "流量", icon: Activity, feature: "traffic" },
      { to: "/dns", label: "DNS", icon: Globe, feature: "dns" },
      { to: "/rules", label: "规则", icon: Shield, feature: "rules" },
    ],
  },
  {
    title: "Surge",
    items: [
      { to: "/modules", label: "模块", icon: Plug, feature: "modules" },
      { to: "/scripts", label: "脚本", icon: Code2, feature: "scripts" },
      { to: "/configuration", label: "配置", icon: ScrollText },
      { to: "/events", label: "事件", icon: Cable, feature: "events" },
    ],
  },
  {
    title: "系统",
    items: [
      { to: "/connections", label: "连接", icon: Wifi },
      { to: "/settings", label: "设置", icon: Settings },
      { to: "/settings/diagnostics", label: "API 诊断", icon: Stethoscope },
    ],
  },
];

export const MOBILE_NAV: NavItem[] = [
  { to: "/", label: "首页", icon: Gauge },
  { to: "/policies", label: "策略", icon: GitBranch },
  { to: "/requests", label: "请求", icon: ListOrdered },
  { to: "/traffic", label: "流量", icon: Activity },
  { to: "/settings", label: "设置", icon: Settings },
];