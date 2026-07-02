// PipelinePulse — 管线脉搏：4 个 display KPI 裸排 + 细分隔线，不加卡片框（蓝图 §2.1）。
// display 数字层与下方 12px 密表形成字号跨度（蓝图 §1.1-1 层级对比）。
import { StatDisplay } from "@/components/ui/StatDisplay";
import { cn } from "@/lib/cn";
import { NA, fmtRelative } from "@/lib/format";
import type { OverviewResponse } from "@/lib/types";

interface PipelinePulseProps {
  overview: OverviewResponse;
}

export function PipelinePulse({ overview }: PipelinePulseProps) {
  const { latestRun, watchlist } = overview;
  // 服务端 portfolio 文件缺失时返回 null（lib/types.ts 声明偏严，此处按可空处理）
  const portfolio = overview.portfolio as OverviewResponse["portfolio"] | null;

  const archivedCount = watchlist.byStatus.archived ?? 0;
  const activeCount = watchlist.total - archivedCount;

  const cells = [
    {
      label: "最新批次候选",
      value: latestRun ? String(latestRun.candidateCount) : NA,
      sub: latestRun ? (
        <span className="num">{`${fmtRelative(latestRun.generatedAt)} · ${latestRun.runId}`}</span>
      ) : (
        "尚未运行筛选"
      ),
    },
    {
      label: "扫描股票数",
      value: latestRun ? String(latestRun.totalStocksScanned) : NA,
      sub: latestRun ? (
        <span className="num">{`${latestRun.sourceCount} 个数据源`}</span>
      ) : (
        "npm run screen 生成批次"
      ),
    },
    {
      label: "Watchlist 活跃",
      value: watchlist.total > 0 ? String(activeCount) : NA,
      sub:
        watchlist.total > 0 ? (
          <span className="num">{`共 ${watchlist.total} · 已归档 ${archivedCount}`}</span>
        ) : (
          "暂无追踪候选"
        ),
    },
    {
      label: "组合仓位",
      value: portfolio ? String(portfolio.positionCount) : NA,
      sub: portfolio ? (
        <span className="num">{`更新于 ${fmtRelative(portfolio.updatedAt)}`}</span>
      ) : (
        "未提供组合文件"
      ),
    },
  ];

  return (
    <section aria-label="管线脉搏" className="border-b border-line pb-5">
      <div className="grid grid-cols-2 gap-y-5 md:grid-cols-4">
        {cells.map((cell, index) => (
          <div
            key={cell.label}
            className={cn(
              "px-4 md:px-6",
              index === 0 && "pl-0 md:pl-0",
              index % 2 === 1 && "border-l border-line",
              // 移动端 2 列时 index 2 是第二行首列：左侧不缩进不加线；md 4 列时恢复分隔线
              index === 2 && "pl-0 md:border-l md:border-line md:pl-6",
            )}
          >
            <StatDisplay label={cell.label} value={cell.value} sub={cell.sub} />
          </div>
        ))}
      </div>
    </section>
  );
}
