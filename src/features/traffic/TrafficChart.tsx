import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useThemeSync } from "@/lib/theme";

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

interface TrafficChartProps {
  /** latest snapshots, oldest first */
  series: { time: number; upload: number; download: number }[];
  /** Optional explicit chart height. Dashboard uses this to avoid tall mobile charts. */
  height?: number | string;
}

/** Read a CSS custom property from :root (theme-aware, see tokens.css). */
function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function TrafficChart({ series, height }: TrafficChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Re-render when theme changes (axis/text colors differ between modes)
  useThemeSync();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    chartRef.current = echarts.init(element);
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => chartRef.current?.resize());
    };

    // Browser zoom, sidebar changes and responsive wrapping can resize the
    // chart container without a reliable window resize after async content
    // settles. Observe the actual element so ECharts always matches it.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onResize) : null;
    observer?.observe(element);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Fix 12: business chart colors come from tokens.css, not hardcoded hex.
    const upload = cssVar("--chart-upload", "#0a84ff");
    const download = cssVar("--chart-download", "#bf5af2");
    const axisColor = cssVar("--chart-axis", "#98a2b3");
    const splitColor = cssVar("--chart-grid", "rgba(15,23,42,.05)");
    const uploadArea = hexToRgba(upload, 0.08);
    const downloadArea = hexToRgba(download, 0.08);
    const firstTime = series[0]?.time ?? 0;
    const lastTime = series[series.length - 1]?.time ?? firstTime;
    const spanMs = Math.max(0, lastTime - firstTime);

    chart.setOption({
      animationDuration: 120,
      tooltip: {
        trigger: "axis",
        backgroundColor: "var(--glass)",
        borderColor: "var(--glass-border)",
        textStyle: { color: "var(--text-primary)", fontSize: 12 },
      },
      grid: { left: 8, right: 8, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: "time",
        boundaryGap: false,
        axisLine: { lineStyle: { color: splitColor } },
        axisLabel: {
          color: axisColor,
          fontSize: 11,
          hideOverlap: true,
          margin: 10,
          formatter: (value: string | number) => formatTimeAxisLabel(Number(value), spanMs),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: axisColor, fontSize: 11 },
        splitLine: { lineStyle: { color: splitColor } },
      },
      series: [
        {
          name: "上传",
          type: "line",
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2, color: upload },
          itemStyle: { color: upload },
          areaStyle: { color: uploadArea },
          data: series.map((p) => [p.time, p.upload]),
        },
        {
          name: "下载",
          type: "line",
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2, color: download },
          itemStyle: { color: download },
          areaStyle: { color: downloadArea },
          data: series.map((p) => [p.time, p.download]),
        },
      ],
    });
  }, [series]);

  return (
    <div
      ref={ref}
      className="h-64 w-full"
      style={height === undefined ? undefined : { height, minHeight: height, flex: "0 0 auto" }}
      aria-label="流量图表"
    />
  );
}

function formatTimeAxisLabel(value: number, spanMs: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  if (spanMs >= 48 * 60 * 60 * 1000) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (spanMs >= 6 * 60 * 60 * 1000) return `${hh}:${mm}`;

  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** #rrggbb -> rgba(r,g,b,a); leaves rgba()/named colors untouched. */
function hexToRgba(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}
