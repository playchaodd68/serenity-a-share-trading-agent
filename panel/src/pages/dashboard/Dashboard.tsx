// 总览 Dashboard（蓝图 §2.1）：一屏回答"研究管线现在什么状态、今天该看什么"。
// 版式借鉴 tickflow-stock-panel Dashboard 的 xl:grid-cols-[1fr_20rem] 主区+右栏骨架；
// 顶部 4 个 display KPI 不加卡片框、裸排 + 细分隔线（改掉参考项目的均匀卡片密度）。
// 数据：/api/overview 聚合端点（右栏迷你卡按需补 /api/resolutions、/api/ladder/history）。
import { LayoutDashboard, RotateCw } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtRelative } from "@/lib/format";
import { useOverview } from "@/lib/useSharedQueries";
import { CalibrationMiniCard } from "@/pages/dashboard/CalibrationMiniCard";
import { ChurnCard } from "@/pages/dashboard/ChurnCard";
import { EvidenceQueueCard } from "@/pages/dashboard/EvidenceQueueCard";
import { LadderMiniCard } from "@/pages/dashboard/LadderMiniCard";
import { LatestReportCard } from "@/pages/dashboard/LatestReportCard";
import { PipelinePulse } from "@/pages/dashboard/PipelinePulse";
import { ThemeHeatStrip } from "@/pages/dashboard/ThemeHeatStrip";
import { WatchlistDigest } from "@/pages/dashboard/WatchlistDigest";

/** 首次加载骨架：display KPI 行 + 双栏占位（compositor 友好的透明度脉冲）。 */
function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6 px-5 py-5" role="status" aria-label="加载总览数据">
      <div className="grid grid-cols-2 gap-5 border-b border-line pb-5 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 rounded-btn bg-raised" />
            <div className="h-9 w-24 rounded-btn bg-raised" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <div className="h-24 rounded-card bg-surface" />
          <div className="h-64 rounded-card bg-surface" />
        </div>
        <div className="space-y-6">
          <div className="h-48 rounded-card bg-surface" />
          <div className="h-40 rounded-card bg-surface" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const overview = useOverview();
  const data = overview.data;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="总览"
        subtitle="研究管线状态与今日关注"
        right={
          data?.latestRun ? (
            <span className="num text-2xs text-ink-3">最新批次 {fmtRelative(data.latestRun.generatedAt)}</span>
          ) : undefined
        }
      />

      {overview.isLoading ? (
        <DashboardSkeleton />
      ) : !data ? (
        <EmptyState
          icon={LayoutDashboard}
          title="总览数据加载失败"
          hint="面板服务可能未启动 — 先运行 npm run panel:server（端口 8788），再重试。"
          action={
            <button
              type="button"
              onClick={() => void overview.refetch()}
              className="inline-flex items-center gap-1.5 rounded-btn border border-line-strong bg-raised px-3 py-1.5 text-xs text-ink transition-colors duration-fast ease-smooth hover:border-accent hover:text-accent"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              重试
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Layout 壳已有 <main>，此处用 div 避免嵌套 main */}
          <div className="min-w-0 space-y-6">
            <PipelinePulse overview={data} />
            <ThemeHeatStrip latestRun={data.latestRun} />
            <WatchlistDigest watchlist={data.watchlist} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ChurnCard calibration={data.calibration} />
              <LatestReportCard latestRun={data.latestRun} />
            </div>
          </div>
          <aside className="min-w-0 space-y-6">
            <LadderMiniCard ladder={data.ladder} />
            <EvidenceQueueCard />
            <CalibrationMiniCard />
          </aside>
        </div>
      )}
    </div>
  );
}
