// 绩效 KPI 行（蓝图 §2.4 MetricsRow）：display 数字裸排 + 细分隔线 + 与基准对比副行。
import { StatDisplay } from "@/components/ui/StatDisplay";
import { fmtNum, fmtPct, priceColorClass } from "@/lib/format";
import type { QuantBacktestMetrics } from "@/lib/types";

interface MetricsRowProps {
  metrics: QuantBacktestMetrics;
}

export function MetricsRow({ metrics }: MetricsRowProps) {
  const m = metrics;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-line pb-5 sm:grid-cols-4">
      <StatDisplay
        label="累计收益"
        value={fmtPct(m.totalReturn)}
        valueClassName={priceColorClass(m.totalReturn)}
        sub={<>基准 <span className="num">{fmtPct(m.benchmarkTotalReturn)}</span></>}
      />
      <StatDisplay
        label="年化收益"
        value={fmtPct(m.annualizedReturn)}
        valueClassName={priceColorClass(m.annualizedReturn)}
        sub={<>基准年化 <span className="num">{fmtPct(m.benchmarkAnnualizedReturn)}</span></>}
      />
      <StatDisplay
        label="累计超额"
        value={fmtPct(m.excessTotalReturn)}
        valueClassName={priceColorClass(m.excessTotalReturn)}
        sub={<>平均每期超额 <span className="num">{fmtPct(m.avgExcessReturn)}</span></>}
      />
      <StatDisplay
        label="最大回撤"
        value={fmtPct(m.maxDrawdown)}
        valueClassName={priceColorClass(m.maxDrawdown)}
        sub={<>共 <span className="num">{m.periods}</span> 期</>}
      />
      <StatDisplay
        label="夏普"
        value={fmtNum(m.sharpe, 2)}
        sub={<>平均每期净收益 <span className="num">{fmtPct(m.avgNetReturn)}</span></>}
      />
      <StatDisplay label="Calmar" value={fmtNum(m.calmar, 2)} sub="年化收益 / |最大回撤|" />
      <StatDisplay
        label="胜率"
        value={fmtPct(m.hitRate, 1, false)}
        sub="净收益为正的期数占比"
      />
      <StatDisplay
        label="平均换手"
        value={fmtPct(m.avgTurnover, 1, false)}
        sub={<>平均成交权重 <span className="num">{fmtPct(m.avgTradedWeight, 1, false)}</span></>}
      />
    </div>
  );
}
