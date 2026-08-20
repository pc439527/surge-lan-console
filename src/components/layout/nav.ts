import {
  Activity,
  Cable,
  Code2,
  Gauge,
  GitBranch,
  Globe,
  ListOrdered,
  Plug,
  ScrollText,
  Settings,
  Shield,
  Stethoscope,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "概览",
    items: [{ to: "/", label: "仪表盘", icon: Gauge }],
  },
  {
    title: "网络",
    items: [
      { to: "/policies", label: "策略", icon: GitBranch },
      { to: "/requests", label: "请求", icon: ListOrdered },
      { to: "/traffic", label: "流量", icon: Activity },
      { to: "/dns", label: "DNS", icon: Globe },
      { to: "/rules", label: "规则", icon: Shield },
    ],
  },
  {
    title: "Surge",
    items: [
      { to: "/modules", label: "模块", icon: Plug },
      { to: "/scripts", label: "脚本", icon: Code2 },
      { to: "/configuration", label: "配置", icon: ScrollText },
      { to: "/events", label: "事件", icon: Cable },
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