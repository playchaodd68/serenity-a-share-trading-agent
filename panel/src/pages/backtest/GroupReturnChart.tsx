// 分组收益条形（蓝图 §2.4 GroupReturnChart）：各评分分组的平均前瞻收益 + 胜率线。
// 平均收益为收益语义 → bull/bear 着色；胜率为比率 → accent。
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/charts/EChart";
import { readChartTokens } from "@/lib/chartTheme";
import { fmtPct } from "@/lib/format";
import type { QuantBacktestGroupReturn } from "@/lib/types";

interface GroupReturnChartProps {
  groups: QuantBacktestGroupReturn[];
  className?: string;
}

export function GroupReturnChart({ groups, className }: GroupReturnChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const t = readChartTokens();
    const pctLabel = {
      color: t.ink3,
      fontSize: 10,
      fontFamily: t.fontMono,
      formatter: (v: number) => fmtPct(v, 1, false),
    };

    return {
      legend: { top: 0, data: ["平均前瞻收益", "胜率"] },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const list = params as Array<{ dataIndex?: number; marker?: string; seriesName?: string; value?: number }>;
          if (!Array.isArray(list) || list.length === 0) return "";
          const group = groups[list[0]?.dataIndex ?? 0];
          const lines = list.map(
            (p) => `${p.marker ?? ""}${p.seriesName ?? ""}&nbsp;&nbsp;${fmtPct(p.value ?? null, 2, p.seriesName === "平均前瞻收益")}`,
          );
          return [`${group?.group ?? ""}（${group?.observations ?? 0} 个观测）`, ...lines].join("<br/>");
        },
      },
      grid: { left: 56, right: 52, top: 28, bottom: 24 },
      xAxis: {
        type: "category",
        data: groups.map((g) => g.group),
        axisLine: { lineStyle: { color: t.line } },
        axisTick: { show: false },
        axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono },
      },
      yAxis: [
        {
          type: "value",
          name: "平均收益",
          nameTextStyle: { color: t.ink3, fontSize: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: pctLabel,
          splitLine: { lineStyle: { color: t.grid } },
        },
        {
          type: "value",
          name: "胜率",
          nameTextStyle: { color: t.ink3, fontSize: 10 },
          min: 0,
          max: 1,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: pctLabel,
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "平均前瞻收益",
          type: "bar",
          barMaxWidth: 28,
          yAxisIndex: 0,
          data: groups.map((g) => ({
            value: g.averageForwardReturn,
            itemStyle: { color: g.averageForwardReturn >= 0 ? t.bull : t.bear, opacity: 0.85 },
          })),
        },
        {
          name: "胜率",
          type: "line",
          yAxisIndex: 1,
          data: groups.map((g) => g.winRate),
          showSymbol: true,
          symbolSize: 6,
          lineStyle: { width: 1.5, color: t.accent },
          itemStyle: { color: t.accent },
        },
      ],
    } as EChartsOption;
  }, [groups]);

  return <EChart option={option} className={className} aria-label="评分分组的平均前瞻收益与胜率" />;
}
