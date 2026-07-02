// 回测页（蓝图 §2.4）：绩效 / 过拟合检验 / 分期明细 三 Tab。
// Tab 骨架 adapted from tickflow-stock-panel (MIT) 的 Backtest 分段模式切换。
// 数据：GET /api/backtest/latest（runs/quant-backtest-latest.json）；无工件时空态引导。
import { useState } from "react";
import { FlaskConical, Gauge, LineChart, Rows3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { fmtDateTime, fmtPct } from "@/lib/format";
import { useBacktestLatest } from "@/lib/useSharedQueries";
import type { QuantBacktestResult } from "@/lib/types";
import { OverfittingPanel } from "./OverfittingPanel";
import { PerformancePanel } from "./PerformancePanel";
import { PeriodTable } from "./PeriodTable";

type TabKey = "performance" | "overfitting" | "periods";

const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "performance", label: "绩效", icon: LineChart },
  { key: "overfitting", label: "过拟合检验", icon: Gauge },
  { key: "periods", label: "分期明细", icon: Rows3 },
];

function TabSwitch({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <div role="tablist" aria-label="回测视图切换" className="inline-flex rounded-btn border border-line bg-surface p-0.5">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-medium transition-colors duration-fast ease-smooth",
              // text-base 会被 Tailwind 解析为字号而非 base 色，故用变量引用
              isActive ? "bg-accent text-[color:var(--color-base)]" : "text-ink-2 hover:bg-raised hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** 分期明细 Tab：执行约束统计条 + 分期表。 */
function PeriodsPanel({ result }: { result: QuantBacktestResult }) {
  const stats = result.executionStats;
  const items: Array<{ label: string; value: number }> = [
    { label: "一字涨停无法买入", value: stats.buyBlockedOnePriceLimitUp },
    { label: "一字跌停无法卖出", value: stats.sellBlockedOnePriceLimitDown },
    { label: "停牌无法卖出", value: stats.sellBlockedSuspended },
    { label: "待退出持仓", value: stats.pendingExits },
    { label: "累计受限持有天数", value: stats.blockedExitDays },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-card border border-line bg-surface px-4 py-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline gap-2">
            <span className="text-2xs uppercase tracking-wider text-ink-3">{item.label}</span>
            <span className={cn("num text-sm font-medium", item.value > 0 ? "text-warning" : "text-ink-2")}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
      <section className="rounded-card border border-line bg-surface p-2">
        <PeriodTable periods={result.periods} />
      </section>
    </div>
  );
}

export default function Backtest() {
  const [activeTab, setActiveTab] = useState<TabKey>("performance");
  const { data, isLoading } = useBacktestLatest();

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="回测" subtitle="绩效 · 过拟合检验 · 分期明细" />
        <div className="grid flex-1 place-items-center text-sm text-ink-3" role="status">
          加载回测工件中…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="回测" subtitle="绩效 · 过拟合检验 · 分期明细" />
        <EmptyState
          icon={FlaskConical}
          title="尚无回测工件"
          hint={
            <>
              回测结果读取 <code className="num text-xs">runs/quant-backtest-latest.json</code>，运行{" "}
              <code className="num text-xs">npm run quant:backtest</code> 生成。
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="回测"
        subtitle={`${data.strategy} · 生成于 ${fmtDateTime(data.generatedAt)}`}
        right={<TabSwitch active={activeTab} onChange={setActiveTab} />}
      />

      <div className="flex-1 space-y-5 px-5 py-4">
        {activeTab === "performance" && <PerformancePanel result={data} />}
        {activeTab === "overfitting" && <OverfittingPanel overfitting={data.overfitting} cscv={data.cscv} />}
        {activeTab === "periods" && <PeriodsPanel result={data} />}

        {data.notes.length > 0 && (
          <footer className="border-t border-line pt-3">
            <h2 className="text-2xs uppercase tracking-wider text-ink-3">脚注（含双向拥挤度计价说明）</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-ink-3">
              {data.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ol>
          </footer>
        )}

        <p className="num text-2xs text-ink-3">
          组合 {data.options.portfolioSize} 只 · 最低评分 {data.options.minScore} · 单行业上限{" "}
          {fmtPct(data.options.maxIndustryWeight, 0, false)} · 交易成本 {data.options.transactionCostBps}bp + 滑点{" "}
          {data.options.slippageBps}bp · 年化期数 {data.options.periodsPerYear}
        </p>
      </div>
    </div>
  );
}
