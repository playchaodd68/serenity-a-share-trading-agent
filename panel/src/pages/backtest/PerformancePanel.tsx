// 绩效 Tab（蓝图 §2.4）：MetricsRow + 净值/回撤 + RankIC + 分组收益 + 评分桶统计。
import { BarChart3, Layers, LineChart, TrendingUp } from "lucide-react";
import { EquityChart } from "@/components/charts/EquityChart";
import { IcChart } from "@/components/charts/IcChart";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtNum } from "@/lib/format";
import type { QuantBacktestResult } from "@/lib/types";
import { BucketStatTable } from "./BucketStatTable";
import { GroupReturnChart } from "./GroupReturnChart";
import { MetricsRow } from "./MetricsRow";

interface PerformancePanelProps {
  result: QuantBacktestResult;
}

export function PerformancePanel({ result }: PerformancePanelProps) {
  return (
    <div className="space-y-5">
      <MetricsRow metrics={result.metrics} />

      <section className="rounded-card border border-line bg-surface p-4">
        <SectionTitle
          icon={TrendingUp}
          title="净值曲线与回撤"
          hint={
            <>
              起始净值 {fmtNum(result.options.initialEquity, 0)} · {result.periods.length} 期
            </>
          }
        />
        <EquityChart periods={result.periods} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-4">
          <SectionTitle icon={LineChart} title="RankIC" hint={<>{result.ic.length} 期</>} />
          <IcChart ic={result.ic} />
        </section>
        <section className="rounded-card border border-line bg-surface p-4">
          <SectionTitle icon={BarChart3} title="分组收益" hint={<>{result.groupReturns.length} 组</>} />
          <GroupReturnChart groups={result.groupReturns} className="h-64" />
        </section>
      </div>

      <section className="rounded-card border border-line bg-surface p-4">
        <SectionTitle icon={Layers} title="评分桶统计" />
        <BucketStatTable bucketStats={result.bucketStats} />
      </section>
    </div>
  );
}
