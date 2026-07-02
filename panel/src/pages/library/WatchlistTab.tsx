// Watchlist 候选表：五态徽标 / evidenceState 四指标 / coverageGaps / 下次复核，
// 行点击打开详情抽屉（时间线、否决条件、催化剂）。默认按下次复核时间升序（到期优先）。
import { Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, WatchlistStatusBadge, watchlistStatusLabel } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNum } from "@/lib/format";
import type { WatchlistEntry, WatchlistStatus } from "@/lib/types";
import { useWatchlist } from "@/lib/useSharedQueries";
import { confidenceLabels } from "./labels";
import { LoadingBlock } from "./primitives";
import { WatchlistDetailDrawer } from "./WatchlistDetailDrawer";

const STATUS_ORDER: readonly WatchlistStatus[] = [
  "evidence-needed",
  "investigating",
  "validated",
  "downgraded",
  "archived",
] as const;

function buildColumns(now: number): Array<DataTableColumn<WatchlistEntry>> {
  return [
    {
      key: "stock",
      header: "代码 / 名称",
      render: (row) => (
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="num text-xs text-ink-3">{row.code}</span>
          <span className="font-medium text-ink">{row.name}</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "状态",
      render: (row) => <WatchlistStatusBadge status={row.status} />,
    },
    {
      key: "score",
      header: "评分",
      className: "num text-right",
      render: (row) => <span className="text-ink">{fmtNum(row.score, 1)}</span>,
    },
    {
      key: "confidence",
      header: "置信度",
      render: (row) => confidenceLabels[row.confidence],
    },
    {
      key: "evidence",
      header: "证据（P0 / 直证 / 佐证 / 风险）",
      render: (row) => (
        <span className="num flex items-center gap-2.5 text-xs">
          <span
            className={row.evidenceState.hasCandidateP0 ? "text-accent" : "text-ink-3"}
            title={row.evidenceState.hasCandidateP0 ? "已有候选级 P0 主来源" : "缺候选级 P0 主来源"}
          >
            P0{row.evidenceState.hasCandidateP0 ? "✓" : "×"}
          </span>
          <span title="直接证据数">直 {row.evidenceState.directEvidenceCount}</span>
          <span title="佐证证据数">佐 {row.evidenceState.corroboratingEvidenceCount}</span>
          <span
            className={row.evidenceState.riskEvidenceCount > 0 ? "text-warning" : "text-ink-3"}
            title="风险证据数"
          >
            险 {row.evidenceState.riskEvidenceCount}
          </span>
        </span>
      ),
    },
    {
      key: "gaps",
      header: "覆盖缺口",
      render: (row) =>
        row.coverageGaps.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {row.coverageGaps.slice(0, 2).map((gap) => (
              <Badge key={gap} variant="warning" className="max-w-[14rem]" title={gap}>
                <span className="min-w-0 truncate">{gap}</span>
              </Badge>
            ))}
            {row.coverageGaps.length > 2 && (
              <Badge variant="muted" title={row.coverageGaps.slice(2).join("；")}>
                +{row.coverageGaps.length - 2}
              </Badge>
            )}
          </span>
        ) : (
          <span className="text-2xs text-ink-3">无</span>
        ),
    },
    {
      key: "nextReviewAt",
      header: "下次复核",
      render: (row) => {
        const isOverdue = new Date(row.nextReviewAt).getTime() < now;
        return (
          <span className={cn("num text-xs", isOverdue ? "text-warning" : "text-ink-2")}>
            {fmtDate(row.nextReviewAt)}
            {isOverdue && " · 已到期"}
          </span>
        );
      },
    },
  ];
}

export function WatchlistTab() {
  const watchlistQuery = useWatchlist();
  const [selected, setSelected] = useState<WatchlistEntry | null>(null);

  const entries = useMemo(() => {
    const list = watchlistQuery.data ?? [];
    return [...list].sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
  }, [watchlistQuery.data]);

  const statusCounts = useMemo(() => {
    const counts = new Map<WatchlistStatus, number>();
    for (const entry of entries) counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
    return counts;
  }, [entries]);

  const columns = useMemo(() => buildColumns(Date.now()), []);

  if (watchlistQuery.isLoading) return <LoadingBlock label="加载 Watchlist…" />;

  return (
    <section aria-label="Watchlist 候选">
      <SectionTitle
        icon={Eye}
        title="Watchlist 候选"
        hint={entries.length > 0 ? `${entries.length} 条 · 按下次复核排序` : undefined}
      />

      {entries.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5" aria-label="状态分布">
          {STATUS_ORDER.map((status) => {
            const count = statusCounts.get(status) ?? 0;
            if (count === 0) return null;
            return (
              <span key={status} className="flex items-center gap-1.5">
                <WatchlistStatusBadge status={status} />
                <span className="num text-xs text-ink-2" aria-label={`${watchlistStatusLabel(status)} ${count} 条`}>
                  {count}
                </span>
              </span>
            );
          })}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(row) => row.code}
        onRowClick={setSelected}
        empty={
          <EmptyState
            icon={Eye}
            title="Watchlist 为空"
            hint={
              <>
                运行 <code className="num rounded-input bg-raised px-1.5 py-0.5 text-xs">npm run screen</code>{" "}
                后，入选候选会自动进入 data/watchlist.json 并在此追踪证据与复核节奏。
              </>
            }
          />
        }
      />

      <WatchlistDetailDrawer entry={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
