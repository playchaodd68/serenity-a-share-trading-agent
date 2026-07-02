// RankIC 柱状 + 滚动均线（蓝图 §2.4 IcChart）。颜色经 chartTheme 从 CSS 变量派生。
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/charts/EChart";
import { readChartTokens } from "@/lib/chartTheme";
import { cn } from "@/lib/cn";
import { fmtNum } from "@/lib/format";
import type { QuantBacktestIc } from "@/lib/types";

const ROLLING_WINDOW = 6;

interface IcChartProps {
  ic: QuantBacktestIc[];
  className?: string;
}

/** 滚动均值：窗口内有效（非 null）样本的均值，无有效样本时为 null。 */
function rollingMean(values: Array<number | null>, window: number): Array<number | null> {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - window + 1), index + 1).filter((v): v is number => v != null);
    if (slice.length === 0) return null;
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
}

export function IcChart({ ic, className }: IcChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const t = readChartTokens();
    const values = ic.map((point) => point.rankIc);
    const rolling = rollingMean(values, ROLLING_WINDOW);

    return {
      legend: { top: 0, data: ["RankIC", `滚动均值(${ROLLING_WINDOW}期)`] },
      tooltip: {
        trigger: "axis",
        valueFormatter: (v: unknown) => fmtNum(typeof v === "number" ? v : null, 4),
      },
      grid: { left: 52, right: 12, top: 28, bottom: 24 },
      xAxis: {
        type: "category",
        data: ic.map((point) => point.date),
        axisLine: { lineStyle: { color: t.line } },
        axisTick: { show: false },
        axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono, formatter: (v: number) => fmtNum(v, 2) },
        splitLine: { lineStyle: { color: t.grid } },
      },
      series: [
        {
          name: "RankIC",
          type: "bar",
          barMaxWidth: 14,
          data: ic.map((point) => ({
            value: point.rankIc,
            itemStyle: { color: (point.rankIc ?? 0) >= 0 ? t.accent : t.ink3, opacity: 0.85 },
          })),
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: t.lineStrong, type: "dashed", width: 1 },
            data: [{ yAxis: 0 }],
          },
        },
        {
          name: `滚动均值(${ROLLING_WINDOW}期)`,
          type: "line",
          data: rolling,
          showSymbol: false,
          connectNulls: true,
          lineStyle: { width: 1.5, color: t.ma[2] },
          itemStyle: { color: t.ma[2] },
        },
      ],
    } as EChartsOption;
  }, [ic]);

  return <EChart option={option} className={cn("h-64", className)} aria-label="RankIC 柱状与滚动均线" />;
}
