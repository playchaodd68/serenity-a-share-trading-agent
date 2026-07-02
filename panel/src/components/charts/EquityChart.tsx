// 净值 vs 基准双线 + 回撤面积副图（蓝图 §2.4 EquityChart）。
// 颜色全部经 chartTheme 从 tokens.css 的 CSS 变量运行时派生，禁止字面量色值。
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/charts/EChart";
import { readChartTokens, type ChartTokens } from "@/lib/chartTheme";
import { cn } from "@/lib/cn";
import { fmtNum, fmtPct } from "@/lib/format";
import type { QuantBacktestPeriodResult } from "@/lib/types";

interface EquityChartProps {
  periods: QuantBacktestPeriodResult[];
  className?: string;
}

interface AxisTooltipParam {
  axisValueLabel?: string;
  marker?: string;
  seriesName?: string;
  value?: number | null;
}

function categoryAxis(t: ChartTokens, gridIndex: number, dates: string[], showLabel: boolean) {
  return {
    type: "category" as const,
    gridIndex,
    data: dates,
    boundaryGap: false,
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
    axisLabel: { show: showLabel, color: t.ink3, fontSize: 10, fontFamily: t.fontMono },
    splitLine: { show: false },
  };
}

export function EquityChart({ periods, className }: EquityChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const t = readChartTokens();
    const dates = periods.map((p) => p.date);
    const valueLabel = { color: t.ink3, fontSize: 10, fontFamily: t.fontMono };

    return {
      axisPointer: { link: [{ xAxisIndex: "all" }], lineStyle: { color: t.lineStrong } },
      legend: { top: 0, data: ["策略净值", "基准净值", "回撤"] },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const list = params as AxisTooltipParam[];
          if (!Array.isArray(list) || list.length === 0) return "";
          const lines = list.map((p) => {
            const isDrawdown = p.seriesName === "回撤";
            const text = isDrawdown ? fmtPct(p.value ?? null) : fmtNum(p.value ?? null, 2);
            return `${p.marker ?? ""}${p.seriesName ?? ""}&nbsp;&nbsp;${text}`;
          });
          return [list[0]?.axisValueLabel ?? "", ...lines].join("<br/>");
        },
      },
      grid: [
        { left: 56, right: 12, top: 28, height: "54%" },
        { left: 56, right: 12, top: "74%", bottom: 24 },
      ],
      xAxis: [categoryAxis(t, 0, dates, false), categoryAxis(t, 1, dates, true)],
      yAxis: [
        {
          type: "value",
          gridIndex: 0,
          scale: true,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { ...valueLabel, formatter: (v: number) => fmtNum(v, 2) },
          splitLine: { lineStyle: { color: t.grid } },
        },
        {
          type: "value",
          gridIndex: 1,
          max: 0,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { ...valueLabel, formatter: (v: number) => fmtPct(v, 0, false) },
          splitLine: { lineStyle: { color: t.grid } },
        },
      ],
      series: [
        {
          name: "策略净值",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: periods.map((p) => p.equity),
          showSymbol: false,
          lineStyle: { width: 1.5, color: t.accent },
          itemStyle: { color: t.accent },
        },
        {
          name: "基准净值",
          type: "line",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: periods.map((p) => p.benchmarkEquity),
          showSymbol: false,
          lineStyle: { width: 1, color: t.ink3, type: "dashed" },
          itemStyle: { color: t.ink3 },
        },
        {
          // 回撤是亏损语义 → 用哑光 bear（A股绿跌）；仅价格/收益元素可用 bull/bear。
          name: "回撤",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: periods.map((p) => p.drawdown),
          showSymbol: false,
          lineStyle: { width: 1, color: t.bear },
          itemStyle: { color: t.bear },
          areaStyle: { color: t.bear, opacity: 0.22 },
        },
      ],
    } as EChartsOption;
  }, [periods]);

  return <EChart option={option} className={cn("h-80", className)} aria-label="策略净值、基准净值与回撤曲线" />;
}
