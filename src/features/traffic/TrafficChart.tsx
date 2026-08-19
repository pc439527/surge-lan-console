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
}

export function TrafficChart({ series }: TrafficChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Re-render when theme changes (axis/text colors differ between modes)
  useThemeSync();

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const isDark = document.documentElement.classList.contains("dark");
    const axisColor = isDark ? "#747d8b" : "#98a2b3";
    const splitColor = isDark ? "rgba(255,255,255,.06)" : "rgba(15,23,42,.05)";

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
        axisLine: { lineStyle: { color: splitColor } },
        axisLabel: { color: axisColor, fontSize: 11 },
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
          lineStyle: { width: 2, color: "#0a84ff" },
          itemStyle: { color: "#0a84ff" },
          areaStyle: { color: "rgba(10,132,255,.08)" },
          data: series.map((p) => [p.time, p.upload]),
        },
        {
          name: "下载",
          type: "line",
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2, color: "#bf5af2" },
          itemStyle: { color: "#bf5af2" },
          areaStyle: { color: "rgba(191,90,242,.08)" },
          data: series.map((p) => [p.time, p.download]),
        },
      ],
    });
  }, [series]);

  return <div ref={ref} className="h-64 w-full" aria-label="流量图表" />;
}