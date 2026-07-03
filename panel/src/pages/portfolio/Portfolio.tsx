// 持仓页（蓝图 §2.6）：真实持仓 × 研究流水线交叉视图。
// 数据 /api/portfolio（服务端聚合 join watchlist / graveyard / 最新 screen run）。
// 注意：portfolio 文件缺失时服务端返回 null（宁可空态不可崩），页面必须处理。
import { useMemo } from "react";
import { FileWarning, ServerCrash, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatDisplay } from "@/components/ui/StatDisplay";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { usePortfolio } from "@/lib/useSharedQueries";
import { isActiveReject } from "@/pages/portfolio/graveyardTiers";
import { PositionTable } from "@/pages/portfolio/PositionTable";

/** updatedAt 超过 7 天视为陈旧（新鲜度徽标转 warning）。 */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function FreshnessBadge({ updatedAt }: { updatedAt: string }) {
  const stale = Date.now() - new Date(updatedAt).getTime() > STALE_MS;
  return (
    <Badge variant={stale ? "warning" : "outline"} title={`持仓文件更新于 ${fmtDateTime(updatedAt)}`}>
      数据更新 {fmtRelative(updatedAt)}
      {stale && " · 疑似陈旧"}
    </Badge>
  );
}

export default function Portfolio() {
  const query = usePortfolio();
  // 服务端在 data/portfolio.json 缺失时返回 null（共享类型未标注），?? null 统一收窄
  const portfolio = query.data ?? null;

  const summary = useMemo(() => {
    const positions = portfolio?.positions ?? [];
    const buried = positions.filter((p) => p.graveyard != null);
    return {
      total: positions.length,
      watched: positions.filter((p) => p.watchlist != null).length,
      screened: positions.filter((p) => p.latestScreenScore != null).length,
      // 语义分级：红色数字只统计主动否决类；证据不足/未达线是中性档案，单独灰色计数。
      rejected: buried.filter((p) => isActiveReject(p.graveyard!.reason)).length,
      neutralBuried: buried.filter((p) => !isActiveReject(p.graveyard!.reason)).length,
    };
  }, [portfolio]);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="持仓"
        subtitle="真实持仓 × 研究流水线交叉视图"
        right={portfolio ? <FreshnessBadge updatedAt={portfolio.updatedAt} /> : undefined}
      />

      <div className="flex-1 px-5 py-4">
        {query.isLoading ? (
          <div className="grid min-h-[16rem] place-items-center text-sm text-ink-3" role="status">
            加载持仓…
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={ServerCrash}
            title="持仓数据获取失败"
            hint={query.error instanceof Error ? query.error.message : "服务暂不可达，请稍后重试。"}
            action={
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="rounded-btn border border-line px-3 py-1.5 text-xs text-ink-2 transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised hover:text-ink"
              >
                重试
              </button>
            }
          />
        ) : portfolio == null ? (
          <EmptyState
            icon={FileWarning}
            title="未配置持仓文件"
            hint={
              <>
                复制 <span className="num">data/portfolio.example.json</span> 为{" "}
                <span className="num">data/portfolio.json</span> 并填入真实持仓后刷新。
                面板对持仓只读，不会写入该文件。
              </>
            }
          />
        ) : portfolio.positions.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="持仓为空"
            hint={
              <>
                <span className="num">data/portfolio.json</span> 中 positions 为空数组。
                添加持仓条目后，此处将展示每只持仓与 watchlist / 筛选批次 / 墓地的交叉记录。
              </>
            }
          />
        ) : (
          <div className="space-y-5">
            {/* display KPI 裸排 + 细分隔线（蓝图 §1.1-1 层级对比） */}
            <div className="grid grid-cols-2 gap-y-5 border-b border-line pb-4 sm:grid-cols-4 sm:divide-x sm:divide-line">
              <StatDisplay label="持仓数量" value={String(summary.total)} className="sm:pr-4" />
              <StatDisplay
                label="在关注列表"
                value={String(summary.watched)}
                tone={summary.watched > 0 ? "accent" : "muted"}
                sub="有 watchlist 追踪记录"
                className="sm:px-4"
              />
              <StatDisplay
                label="最新批次入选"
                value={String(summary.screened)}
                tone="default"
                sub="出现在最近一次筛选"
                className="sm:px-4"
              />
              <StatDisplay
                label="曾被埋葬"
                value={String(summary.rejected)}
                tone={summary.rejected > 0 ? "danger" : "muted"}
                sub={
                  <>
                    {summary.rejected > 0 ? "主动否决记录（kill/降权/人工），见下表红字" : "无主动否决记录"}
                    {summary.neutralBuried > 0 && (
                      <span className="block text-ink-3">
                        另有 <span className="num">{summary.neutralBuried}</span> 项证据不足/未达线（中性，非否决）
                      </span>
                    )}
                  </>
                }
                className="sm:pl-4"
              />
            </div>

            <section>
              <SectionTitle
                icon={Wallet}
                title="持仓明细"
                hint={`${summary.total} 项 · 更新 ${fmtRelative(portfolio.updatedAt)}`}
              />
              <PositionTable positions={portfolio.positions} />
              <p className="mt-2 text-2xs leading-relaxed text-ink-3">
                权重未提供：持仓文件 schema 无权重字段，面板不做臆造；关注状态、筛选得分与墓地记录由服务端按代码关联，仅供研究复核，不构成交易指令。
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
