// 校准曲线（蓝图 §2.5）：reliabilityBins 的 meanConfidence vs empiricalRate
// 散点连线 + 45° 完美校准参考线；点径按样本数缩放。色值经 chartTheme 派生。
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/charts/EChart";
import { readChartTokens } from "@/lib/chartTheme";
import { cn } from "@/lib/cn";
import { fmtNum, fmtPct } from "@/lib/format";
import type { ReliabilityBin } from "@/lib/types";

interface CalibrationCurveProps {
  bins: ReliabilityBin[];
  className?: string;
}

/** data 每项: [meanConfidence, empiricalRate, count, bucket, brier] */
type CurvePoint = [number, number, number, string, number];

const MIN_SYMBOL = 7;
const MAX_SYMBOL = 20;

export function CalibrationCurve({ bins, className }: CalibrationCurveProps) {
  const option = useMemo<EChartsOption>(() => {
    const t = readChartTokens();
    const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
    const points: CurvePoint[] = [...bins]
      .sort((a, b) => a.meanConfidence - b.meanConfidence)
      .map((bin) => [bin.meanConfidence, bin.empiricalRate, bin.count, bin.bucket, bin.brier]);

    const pctAxis = {
      type: "value" as const,
      min: 0,
      max: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: t.ink3,
        fontSize: 10,
        fontFamily: t.fontMono,
        formatter: (v: number) => fmtPct(v, 0, false),
      },
      splitLine: { lineStyle: { color: t.grid } },
    };

    return {
      legend: { top: 0, data: ["实证命中率", "完美校准"] },
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { seriesName?: string; value?: CurvePoint };
          if (p.seriesName !== "实证命中率" || !Array.isArray(p.value)) return "";
          const [conf, rate, count, bucket, brier] = p.value;
          return [
            `分箱 ${bucket}（${count} 例）`,
            `平均置信 ${fmtPct(conf, 1, false)}`,
            `实证命中率 ${fmtPct(rate, 1, false)}`,
            `Brier ${fmtNum(brier, 4)}`,
          ].join("<br/>");
        },
      },
      grid: { left: 52, right: 16, top: 28, bottom: 28 },
      xAxis: { ...pctAxis, name: "平均置信", nameTextStyle: { color: t.ink3, fontSize: 10 } },
      yAxis: { ...pctAxis, name: "实证命中率", nameTextStyle: { color: t.ink3, fontSize: 10 } },
      series: [
        {
          name: "完美校准",
          type: "line",
          data: [
            [0, 0],
            [1, 1],
          ],
          showSymbol: false,
          silent: true,
          lineStyle: { width: 1, color: t.ink3, type: "dashed" },
          itemStyle: { color: t.ink3 },
        },
        {
          name: "实证命中率",
          type: "line",
          data: points,
          symbol: "circle",
          symbolSize: (value: CurvePoint) =>
            MIN_SYMBOL + (MAX_SYMBOL - MIN_SYMBOL) * Math.sqrt((value[2] ?? 0) / maxCount),
          lineStyle: { width: 1.5, color: t.accent },
          itemStyle: { color: t.accent },
        },
      ],
    } as EChartsOption;
  }, [bins]);

  return <EChart option={option} className={cn("h-72", className)} aria-label="校准曲线：平均置信与实证命中率对比 45 度参考线" />;
}
