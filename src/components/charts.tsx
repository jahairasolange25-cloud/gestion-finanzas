"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export const CHART_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#64748b",
];

export function Chart({
  option,
  height = 280,
  label,
}: {
  option: echarts.EChartsCoreOption;
  height?: number;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={ref}
      style={{ height }}
      role="img"
      aria-label={label}
      className="w-full"
    />
  );
}

export const baseTooltip = {
  trigger: "axis" as const,
  axisPointer: { type: "shadow" as const },
  valueFormatter: (v: number) => `S/ ${(v / 100).toLocaleString("es-PE")}`,
  backgroundColor: "#0f172a",
  borderWidth: 0,
  textStyle: { color: "#f1f5f9", fontSize: 12 },
};

export const axisStyle = {
  axisLine: { lineStyle: { color: "#e2e8f0" } },
  axisLabel: { color: "#94a3b8", fontSize: 11 },
  splitLine: { lineStyle: { color: "#f1f5f9" } },
};
