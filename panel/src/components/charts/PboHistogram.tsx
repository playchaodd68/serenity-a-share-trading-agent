// CSCV logit 分布直方图（蓝图 §2.4 OverfittingPanel）。
// logit ≤ 0 的组合意味着样本内赢家在样本外跌到中位数以下（过拟合证据）→ danger 着色。
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "@/components/charts/EChart";
import { readChartTokens } from "@/lib/chartTheme";
import { cn } from "@/lib/cn";
import { fmtNum } from "@/lib/format";

const TARGET_BIN_COUNT = 9;

/** chartTheme 的 ChartTokens 未含 danger（属共享 lib，本切片不改），此处同样从 CSS 变量派生。 */
function readDangerColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-danger").trim();
}

interface PboHistogramProps {
  logits: number[];
  className?: string;
}

interface HistogramBin {
  label: string;
  count: number;
  /** 分箱上界 ≤ 0 即"过拟合侧"。 */
  negative: boolean;
}

/** 等宽分箱；边界对齐到 step 的整数倍，保证 0 落在箱边界上。 */
function buildBins(logits: number[]): HistogramBin[] {
  if (logits.length === 0) return [];
  const min = Math.min(...logits);
  const max = Math.max(...logits);
  const span = Math.max(max - min, 1e-6);
  const step = span / TARGET_BIN_COUNT;
  const start = Math.floor(min / step) * step;
  const binCount = Math.max(1, Math.ceil((max - start) / step - 1e-9));

  const counts = new Array<number>(binCount).fill(0);
  for (const value of logits) {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((value - start) / step)));
    counts[index] += 1;
  }

  return counts.map((count, index) => {
    const lo = start + index * step;
    const hi = start + (index + 1) * step;
    return {
      label: `${fmtNum(lo, 2)}~${fmtNum(hi, 2)}`,
      count,
      negative: hi <= 1e-9,
    };
  });
}

export function PboHistogram({ logits, className }: PboHistogramProps) {
  const option = useMemo<EChartsOption>(() => {
    const t = readChartTokens();
    const danger = readDangerColor();
    const bins = buildBins(logits);

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { name?: string; value?: number };
          return `logit ${p.name ?? ""}<br/>${p.value ?? 0} 个组合`;
        },
      },
      grid: { left: 44, right: 12, top: 20, bottom: 40 },
      xAxis: {
        type: "category",
        data: bins.map((bin) => bin.label),
        axisLine: { lineStyle: { color: t.line } },
        axisTick: { show: false },
        axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono, rotate: 32 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono },
        splitLine: { lineStyle: { color: t.grid } },
      },
      series: [
        {
          name: "组合数",
          type: "bar",
          barMaxWidth: 26,
          data: bins.map((bin) => ({
            value: bin.count,
            itemStyle: {
              // danger 是 UI 语义色（过拟合红灯），非价格语义
              color: bin.negative ? danger : t.accent,
              opacity: bin.negative ? 0.9 : 0.75,
            },
          })),
        },
      ],
    } as EChartsOption;
  }, [logits]);

  if (logits.length === 0) {
    return (
      <div className={cn("grid h-56 place-items-center text-xs text-ink-3", className)}>
        无 logit 样本（CSCV 组合数为 0）
      </div>
    );
  }

  return <EChart option={option} className={cn("h-56", className)} aria-label="CSCV logit 分布直方图（红色分箱为 logit 小于等于 0 的过拟合侧）" />;
}
