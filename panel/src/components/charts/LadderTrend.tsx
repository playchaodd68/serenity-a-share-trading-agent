// Adapted from tickflow-stock-panel (MIT) — 哑光配色 + 极弱网格的 ECharts 视觉配方（经 chartTheme 从 CSS 变量派生）。
// 近 N 日梯队趋势双轴 mini 图：limitUpCount（琥珀柱，负面拥挤度框架色）与 brokenRate（accent 线，右轴百分比）。
// brokenRate 可能为 null（来源缺失）——该日留断线空档并在 tooltip 标注缺失，绝不臆造成 0。
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/charts/EChart";
import { readChartTokens } from "@/lib/chartTheme";
import { cn } from "@/lib/cn";
import type { LadderHistoryPoint } from "@/lib/types";

interface LadderTrendProps {
  points: LadderHistoryPoint[];
  className?: string;
}

interface TooltipParam {
  seriesName?: string;
  marker?: string;
  axisValueLabel?: string;
  value?: unknown;
}

const SERIES_LIMIT_UP = "涨停家数";
const SERIES_BROKEN_RATE = "炸板率";

function tooltipLine(param: TooltipParam): string {
  const marker = param.marker ?? "";
  const name = param.seriesName ?? "";
  if (param.value == null) return `${marker}${name}　n/a（数据缺失）`;
  const suffix = name === SERIES_BROKEN_RATE ? "%" : " 家";
  return `${marker}${name}　${String(param.value)}${suffix}`;
}

export function LadderTrend({ points, className }: LadderTrendProps) {
  const option = useMemo<EChartsOption>(() => {
    const t = readChartTokens();
    const dates = points.map((p) => p.date.slice(5));
    const limitUpCounts = points.map((p) => p.stats.limitUpCount);
    const brokenRates = points.map((p) =>
      p.stats.brokenRate == null ? null : Number((p.stats.brokenRate * 100).toFixed(1)),
    );

    return {
      grid: { top: 30, right: 40, bottom: 22, left: 34 },
      legend: { top: 0, left: 0 },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown): string => {
          const list = (Array.isArray(params) ? params : [params]) as TooltipParam[];
          const head = list[0]?.axisValueLabel ?? "";
          return [head, ...list.map(tooltipLine)].join("<br/>");
        },
      },
      xAxis: { type: "category", data: dates },
      yAxis: [
        { type: "value", minInterval: 1 },
        {
          type: "value",
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono, formatter: "{value}%" },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: SERIES_LIMIT_UP,
          type: "bar",
          data: limitUpCounts,
          barWidth: "55%",
          itemStyle: { color: t.warning, opacity: 0.72, borderRadius: [2, 2, 0, 0] },
        },
        {
          name: SERIES_BROKEN_RATE,
          type: "line",
          yAxisIndex: 1,
          data: brokenRates,
          connectNulls: false,
          showSymbol: true,
          symbolSize: 4,
          lineStyle: { color: t.accent, width: 1.5 },
          itemStyle: { color: t.accent },
        },
      ],
    };
  }, [points]);

  return (
    <EChart
      option={option}
      className={cn("h-48", className)}
      aria-label="近N日涨停家数与炸板率双轴趋势图"
    />
  );
}
