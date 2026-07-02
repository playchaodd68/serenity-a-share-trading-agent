// WatchlistDigest — 到期复核摘要（蓝图 §2.1）：按 nextReviewAt 到期排序的前 8 条
// （服务端已排序切片）+ evidenceState 徽标。P0 证据用 accent（UI 语义色），
// 不用绿色 — 绿色是 bear 价格语义，禁用于 UI 状态（tokens.css 铁律）。
import { ClipboardCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, WatchlistStatusBadge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNum } from "@/lib/format";
import type { OverviewDueEntry, OverviewResponse } from "@/lib/types";

interface WatchlistDigestProps {
  watchlist: OverviewResponse["watchlist"];
}

/** 距今日的自然日差（负数=已逾期），按本地日期粒度计算。 */
function daysFromToday(iso: string): number | null {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000);
}

function DueCell({ iso }: { iso: string }) {
  const days = daysFromToday(iso);
  const label = days == null ? null : days < 0 ? `逾期 ${-days} 天` : days === 0 ? "今日到期" : `${days} 天后`;
  const isDue = days != null && days <= 0;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={cn("num", isDue ? "font-medium text-warning" : "text-ink-2")}>{label ?? "—"}</span>
      <span className="num text-2xs text-ink-3">{fmtDate(iso)}</span>
    </span>
  );
}

const columns: Array<DataTableColumn<OverviewDueEntry>> = [
  {
    key: "stock",
    header: "标的",
    render: (row) => (
      <span className="inline-flex items-baseline gap-2">
        <span className="font-medium text-ink">{row.name}</span>
        <span className="num text-2xs text-ink-3">{row.code}</span>
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
    key: "evidence",
    header: "证据",
    render: (row) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {row.hasCandidateP0 ? (
          <Badge variant="accent" title="已有候选 P0 直接证据">
            P0
          </Badge>
        ) : (
          <Badge variant="muted" title="缺少候选 P0 直接证据">
            无 P0
          </Badge>
        )}
        {row.riskEvidenceCount > 0 && (
          <Badge variant="danger" title="风险证据条数">
            风险 <span className="num">{row.riskEvidenceCount}</span>
          </Badge>
        )}
      </span>
    ),
  },
  {
    key: "due",
    header: "复核到期",
    render: (row) => <DueCell iso={row.nextReviewAt} />,
  },
];

export function WatchlistDigest({ watchlist }: WatchlistDigestProps) {
  const navigate = useNavigate();

  return (
    <section aria-label="到期复核">
      <SectionTitle
        icon={ClipboardCheck}
        title="到期复核 · Watchlist"
        hint={watchlist.total > 0 ? `活跃 ${watchlist.total} · 展示最先到期 ${watchlist.dueForReview.length} 条` : undefined}
      />
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <DataTable
          columns={columns}
          rows={watchlist.dueForReview}
          rowKey={(row) => row.code}
          onRowClick={() => navigate("/library")}
          empty={
            <EmptyState
              icon={ClipboardCheck}
              title="Watchlist 暂无待复核候选"
              hint={
                <>
                  运行 <span className="num">npm run screen</span> 生成候选并进入 watchlist 追踪后，
                  这里按 nextReviewAt 到期排序展示最需要复核的条目。
                </>
              }
              className="min-h-0 py-10"
            />
          }
        />
      </div>
    </section>
  );
}
