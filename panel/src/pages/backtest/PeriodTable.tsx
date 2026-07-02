// 分期明细（蓝图 §2.4 PeriodTable）：每期 selected 持仓、netReturn、turnover，
// 以及 blockedBuys/blockedSells —— 涨停无法买入 / 跌停无法卖出的真实执行约束展示。
// 行可展开查看当期持仓明细（代码/权重/前瞻收益/冻结态）。
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Rows3 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { fmtNum, fmtPct, priceColorClass, NA } from "@/lib/format";
import type { QuantBacktestPeriodResult, QuantBacktestSelectedPosition } from "@/lib/types";

interface PeriodTableProps {
  periods: QuantBacktestPeriodResult[];
}

const HEADERS: Array<{ label: string; className?: string }> = [
  { label: "日期" },
  { label: "持仓", className: "text-right" },
  { label: "净收益", className: "text-right" },
  { label: "超额", className: "text-right" },
  { label: "换手", className: "text-right" },
  { label: "成本拖累", className: "text-right" },
  { label: "净值", className: "text-right" },
  { label: "回撤", className: "text-right" },
  { label: "受限买入", className: "text-right" },
  { label: "受限卖出", className: "text-right" },
];

function BlockedCell({ codes, kind }: { codes: string[]; kind: "buy" | "sell" }) {
  if (codes.length === 0) return <span className="text-ink-3">{NA}</span>;
  return (
    <Badge
      variant="warning"
      title={`${kind === "buy" ? "一字涨停无法买入" : "一字跌停/停牌无法卖出"}：${codes.join("、")}`}
    >
      {codes.length} 只
    </Badge>
  );
}

function PositionDetail({ selected }: { selected: QuantBacktestSelectedPosition[] }) {
  if (selected.length === 0) {
    return <p className="px-3 py-3 text-xs text-ink-3">本期空仓（无满足入选条件的候选）。</p>;
  }
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="text-left text-2xs uppercase tracking-wider text-ink-3">
          <th scope="col" className="px-3 py-1.5 font-medium">代码 / 名称</th>
          <th scope="col" className="px-3 py-1.5 font-medium">行业</th>
          <th scope="col" className="px-3 py-1.5 font-medium">主题</th>
          <th scope="col" className="num px-3 py-1.5 text-right font-medium">评分</th>
          <th scope="col" className="num px-3 py-1.5 text-right font-medium">权重</th>
          <th scope="col" className="num px-3 py-1.5 text-right font-medium">前瞻收益</th>
          <th scope="col" className="px-3 py-1.5 text-right font-medium">状态</th>
        </tr>
      </thead>
      <tbody>
        {selected.map((pos) => (
          <tr key={pos.code} className="border-t border-line/40">
            <td className="px-3 py-1.5 text-ink">
              <span className="num">{pos.code}</span>
              {pos.name && <span className="ml-1.5 text-ink-2">{pos.name}</span>}
            </td>
            <td className="px-3 py-1.5 text-ink-2">{pos.industry || NA}</td>
            <td className="px-3 py-1.5 text-ink-2">{pos.theme ?? NA}</td>
            <td className="num px-3 py-1.5 text-right text-ink-2">{fmtNum(pos.score, 1)}</td>
            <td className="num px-3 py-1.5 text-right text-ink-2">{fmtPct(pos.weight, 1, false)}</td>
            <td className={cn("num px-3 py-1.5 text-right", priceColorClass(pos.forwardReturn))}>
              {fmtPct(pos.forwardReturn)}
            </td>
            <td className="px-3 py-1.5 text-right">
              {pos.frozen ? (
                <Badge variant="warning" title={pos.blockedExitDays ? `受限持有 ${pos.blockedExitDays} 天` : "无法按计划卖出，被动持有"}>
                  冻结
                </Badge>
              ) : (
                <span className="text-ink-3">{NA}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PeriodTable({ periods }: PeriodTableProps) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  if (periods.length === 0) {
    return <EmptyState icon={Rows3} title="无分期数据" hint="回测结果不含任何调仓期。" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="w-8 px-2 py-2" aria-label="展开" />
            {HEADERS.map((h) => (
              <th
                key={h.label}
                scope="col"
                className={cn("px-3 py-2 text-2xs font-medium uppercase tracking-wider text-ink-3", h.className)}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            const expanded = expandedDate === period.date;
            return (
              <Fragment key={period.date}>
                <tr
                  className={cn(
                    "cursor-pointer border-b border-line/60 transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised/50",
                    expanded && "bg-raised/40",
                  )}
                  onClick={() => setExpandedDate(expanded ? null : period.date)}
                >
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-label={`${expanded ? "收起" : "展开"} ${period.date} 持仓明细`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setExpandedDate(expanded ? null : period.date);
                      }}
                      className="rounded-btn p-0.5 text-ink-3 hover:text-accent"
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      )}
                    </button>
                  </td>
                  <td className="num px-3 py-2 text-ink">{period.date}</td>
                  <td className="num px-3 py-2 text-right text-ink-2">{period.selected.length}</td>
                  <td className={cn("num px-3 py-2 text-right", priceColorClass(period.netReturn))}>
                    {fmtPct(period.netReturn)}
                  </td>
                  <td className={cn("num px-3 py-2 text-right", priceColorClass(period.excessReturn))}>
                    {fmtPct(period.excessReturn)}
                  </td>
                  <td className="num px-3 py-2 text-right text-ink-2">{fmtPct(period.turnover, 1, false)}</td>
                  <td className="num px-3 py-2 text-right text-ink-2">{fmtPct(period.costDrag, 2, false)}</td>
                  <td className="num px-3 py-2 text-right text-ink-2">{fmtNum(period.equity, 3)}</td>
                  <td className={cn("num px-3 py-2 text-right", priceColorClass(period.drawdown))}>
                    {fmtPct(period.drawdown)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <BlockedCell codes={period.blockedBuys} kind="buy" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <BlockedCell codes={period.blockedSells} kind="sell" />
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-line/60 bg-base/40">
                    <td colSpan={HEADERS.length + 1} className="px-2 py-2">
                      <PositionDetail selected={period.selected} />
                      {(period.blockedBuys.length > 0 || period.blockedSells.length > 0) && (
                        <div className="mt-2 space-y-1 px-3 pb-1 text-xs text-ink-3">
                          {period.blockedBuys.length > 0 && (
                            <p>
                              受限买入（一字涨停）：<span className="num text-warning">{period.blockedBuys.join("、")}</span>
                            </p>
                          )}
                          {period.blockedSells.length > 0 && (
                            <p>
                              受限卖出（一字跌停/停牌）：<span className="num text-warning">{period.blockedSells.join("、")}</span>
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
