// 过程校准区（蓝图 §2.5）：scoreDistribution / confidenceDistribution 直方、
// recurringCoverageGaps 排行条形（系统性证据缺口排行榜）、candidateChurn。
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { ArrowLeftRight, BarChart2, SearchX } from "lucide-react";
import { EChart } from "@/components/charts/EChart";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { readChartTokens } from "@/lib/chartTheme";
import { NA } from "@/lib/format";
import type { CalibrationSnapshot, ConfidenceLevel } from "@/lib/types";

const GAP_RANK_LIMIT = 10;
const CHURN_CHIP_LIMIT = 6;

const CONFIDENCE_ORDER: ConfidenceLevel[] = ["low", "medium", "high"];
const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { low: "低", medium: "中", high: "高" };

interface ProcessSectionProps {
  snapshot: CalibrationSnapshot;
}

/** 单序列计数直方（分布图共用）。 */
function DistributionChart({ entries, ariaLabel }: { entries: Array<[string, number]>; ariaLabel: string }) {
  const option = useMemo<EChartsOption>(() => {
    const t = readChartTokens();
    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { name?: string; value?: number };
          return `${p.name ?? ""}：${p.value ?? 0} 个候选`;
        },
      },
      grid: { left: 40, right: 12, top: 16, bottom: 24 },
      xAxis: {
        type: "category",
        data: entries.map(([label]) => label),
        axisLine: { lineStyle: { color: t.line } },
        axisTick: { show: false },
        axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono },
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
          type: "bar",
          barMaxWidth: 32,
          data: entries.map(([, count]) => count),
          itemStyle: { color: t.accent, opacity: 0.8 },
        },
      ],
    } as EChartsOption;
  }, [entries]);

  return <EChart option={option} className="h-48" aria-label={ariaLabel} />;
}

/** 评分桶按数值下界排序（"0-39" < "40-54" < "70+"）。 */
function sortScoreBuckets(distribution: Record<string, number>): Array<[string, number]> {
  return Object.entries(distribution).sort(
    ([a], [b]) => (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0),
  );
}

function GapRanking({ gaps }: { gaps: Array<{ gap: string; count: number }> }) {
  const top = [...gaps].sort((a, b) => b.count - a.count).slice(0, GAP_RANK_LIMIT);
  if (top.length === 0) {
    return <p className="py-6 text-center text-xs text-ink-3">无重复出现的证据缺口 —— 覆盖面良好。</p>;
  }
  const max = top[0]?.count ?? 1;
  return (
    <ol className="space-y-2">
      {top.map((item, index) => (
        <li key={item.gap} className="grid grid-cols-[1.25rem_1fr_2.5rem] items-center gap-2">
          <span className="num text-2xs text-ink-3">{index + 1}</span>
          <div className="min-w-0">
            <p className="truncate text-xs text-ink-2" title={item.gap}>
              {item.gap}
            </p>
            <div className="mt-1 h-1 rounded-pill bg-raised">
              {/* 证据缺口是负面信号 → warning 琥珀 */}
              <div
                className="h-full rounded-pill bg-warning/70"
                style={{ width: `${Math.max((item.count / max) * 100, 4)}%` }}
              />
            </div>
          </div>
          <span className="num text-right text-xs text-ink">{item.count}×</span>
        </li>
      ))}
    </ol>
  );
}

function ChurnChips({ codes, tone }: { codes: string[]; tone: "accent" | "muted" | "default" }) {
  if (codes.length === 0) return <span className="text-xs text-ink-3">{NA}</span>;
  const toneClass =
    tone === "accent" ? "bg-accent/15 text-accent" : tone === "muted" ? "bg-raised text-ink-3" : "bg-raised text-ink-2";
  return (
    <span className="flex flex-wrap gap-1">
      {codes.slice(0, CHURN_CHIP_LIMIT).map((code) => (
        <span key={code} className={`num rounded-pill px-1.5 py-0.5 text-2xs ${toneClass}`}>
          {code}
        </span>
      ))}
      {codes.length > CHURN_CHIP_LIMIT && (
        <span className="num text-2xs text-ink-3">+{codes.length - CHURN_CHIP_LIMIT}</span>
      )}
    </span>
  );
}

export function ProcessSection({ snapshot }: ProcessSectionProps) {
  const scoreEntries = sortScoreBuckets(snapshot.scoreDistribution);
  const confidenceEntries: Array<[string, number]> = CONFIDENCE_ORDER.map((level) => [
    CONFIDENCE_LABEL[level],
    snapshot.confidenceDistribution[level] ?? 0,
  ]);
  const churn = snapshot.candidateChurn;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-card border border-line bg-surface p-4">
          <SectionTitle icon={BarChart2} title="评分分布" hint={<>{snapshot.candidatesAnalyzed} 个候选</>} />
          <DistributionChart entries={scoreEntries} ariaLabel="候选评分分布直方图" />
        </section>
        <section className="rounded-card border border-line bg-surface p-4">
          <SectionTitle icon={BarChart2} title="置信分布" hint={<>{snapshot.reportsAnalyzed} 份报告</>} />
          <DistributionChart entries={confidenceEntries} ariaLabel="候选置信等级分布直方图" />
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-card border border-line bg-surface p-4">
          <SectionTitle
            icon={SearchX}
            title="系统性证据缺口排行"
            hint={<>历史累计 {snapshot.recurringCoverageGaps.length} 类</>}
          />
          <GapRanking gaps={snapshot.recurringCoverageGaps} />
        </section>

        <section className="rounded-card border border-line bg-surface p-4">
          <SectionTitle
            icon={ArrowLeftRight}
            title="候选流转"
            hint={
              churn.previousRunId ? (
                <>
                  {churn.previousRunId} → {churn.latestRunId ?? NA}
                </>
              ) : (
                churn.latestRunId ?? NA
              )
            }
          />
          <dl className="space-y-3">
            <div>
              <dt className="flex items-baseline justify-between text-xs text-ink-2">
                新进入 <span className="num text-sm font-medium text-ink">{churn.entered.length}</span>
              </dt>
              <dd className="mt-1"><ChurnChips codes={churn.entered} tone="accent" /></dd>
            </div>
            <div>
              <dt className="flex items-baseline justify-between text-xs text-ink-2">
                退出 <span className="num text-sm font-medium text-ink">{churn.exited.length}</span>
              </dt>
              <dd className="mt-1"><ChurnChips codes={churn.exited} tone="muted" /></dd>
            </div>
            <div>
              <dt className="flex items-baseline justify-between text-xs text-ink-2">
                留存 <span className="num text-sm font-medium text-ink">{churn.retained.length}</span>
              </dt>
              <dd className="mt-1"><ChurnChips codes={churn.retained} tone="default" /></dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
