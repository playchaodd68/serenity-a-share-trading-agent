// 墓地：GraveyardSummary（byReason 分布条形 + buriedHitRate display 数字）+
// reason 四类过滤（URL ?reason=）+ 分页条目表（/api/graveyard 服务端分页，加载更多）。
// buriedHitRate 是"被埋葬者事后验证率"——方法论的诚实度指标，给足视觉权重（蓝图 §2.3-4）。
import { useInfiniteQuery } from "@tanstack/react-query";
import { Skull } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatDisplay } from "@/components/ui/StatDisplay";
import { fmtDate, fmtPct, fmtNum, priceColorClass } from "@/lib/format";
import type { GraveyardEntry, GraveyardReason, GraveyardSummary } from "@/lib/types";
import { GRAVEYARD_REASONS, confidenceLabels, graveyardReasonMeta, outcomeMeta } from "./labels";
import { FilterPills, LoadingBlock, SectionLabel } from "./primitives";

const PAGE_SIZE = 100;

type ReasonFilter = GraveyardReason | "";

const FILTER_OPTIONS: ReadonlyArray<{ value: ReasonFilter; label: string }> = [
  { value: "", label: "全部" },
  ...GRAVEYARD_REASONS.map((reason) => ({ value: reason, label: graveyardReasonMeta[reason].label })),
];

function parseReason(raw: string | null): ReasonFilter {
  return raw && (GRAVEYARD_REASONS as readonly string[]).includes(raw) ? (raw as GraveyardReason) : "";
}

// 局部分页查询：共享 hooks（useGraveyard）是单页语义，此处需要"加载更多"累积页，
// 故在本目录内用 useInfiniteQuery 实现；query key 未进 lib/queryKeys.ts 注册表（S3 不改 lib/）。
function useGraveyardInfinite(reason: ReasonFilter) {
  return useInfiniteQuery({
    queryKey: ["graveyard-infinite", reason || "all"],
    queryFn: ({ pageParam }) =>
      api.graveyard({ reason: reason || undefined, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((count, page) => count + page.entries.length, 0);
      return loaded < lastPage.total && lastPage.entries.length > 0 ? loaded : undefined;
    },
    staleTime: 60_000,
  });
}

// ===== 顶部统计：buriedHitRate display + byReason 分布条形 =====

function SummaryBlock({ summary }: { summary: GraveyardSummary }) {
  const reasonRows = GRAVEYARD_REASONS.map((reason) => ({
    reason,
    label: graveyardReasonMeta[reason].label,
    count: summary.byReason[reason] ?? 0,
  }));
  const maxCount = Math.max(1, ...reasonRows.map((row) => row.count));

  return (
    <div className="grid grid-cols-1 items-start gap-x-8 gap-y-5 border-b border-line pb-5 md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <StatDisplay
          label="被埋葬者事后验证率"
          value={summary.buriedHitRate == null ? "—" : fmtPct(summary.buriedHitRate, 1, false)}
          tone={summary.buriedHitRate == null ? "muted" : "default"}
          sub={
            summary.buriedHitRate == null
              ? "尚无已决议的埋葬样本（等待 resolutions-update 到期决议）"
              : `已决议样本 ${summary.resolvedWithOutcome} / ${summary.total} · 越高说明淘汰越过严`
          }
        />
        <StatDisplay label="累计埋葬" value={summary.total} tone="muted" sub="淘汰即记录，不许悄悄消失" />
      </div>

      <section aria-label="按理由分布">
        <SectionLabel>按理由分布</SectionLabel>
        <ul className="mt-2 space-y-1.5">
          {reasonRows.map((row) => (
            <li key={row.reason} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.5rem] items-center gap-2">
              <span className="text-xs text-ink-2">{row.label}</span>
              <span className="h-2 overflow-hidden rounded-pill bg-raised" aria-hidden>
                <span
                  className="block h-full rounded-pill bg-accent"
                  style={{ width: `${(row.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="num text-right text-xs text-ink-2">{row.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-2xs text-ink-3">统计口径为全部墓地，不随下方过滤变化。</p>
      </section>
    </div>
  );
}

// ===== 条目表 =====

const columns: Array<DataTableColumn<GraveyardEntry>> = [
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
    key: "reason",
    header: "理由",
    render: (row) => {
      const meta = graveyardReasonMeta[row.reason] ?? { label: row.reason, variant: "outline" as const };
      return <Badge variant={meta.variant}>{meta.label}</Badge>;
    },
  },
  {
    key: "score",
    header: "评分",
    className: "num text-right",
    render: (row) => fmtNum(row.score, 1),
  },
  {
    key: "confidence",
    header: "置信度",
    render: (row) => confidenceLabels[row.confidence],
  },
  {
    key: "detail",
    header: "缘由",
    className: "max-w-[22rem]",
    render: (row) => (
      <span className="block truncate text-xs text-ink-2" title={row.detail}>
        {row.detail}
      </span>
    ),
  },
  {
    key: "buriedAt",
    header: "埋葬时间",
    render: (row) => <span className="num text-xs">{fmtDate(row.buriedAt)}</span>,
  },
  {
    key: "outcome",
    header: "事后验证",
    render: (row) => {
      if (row.realizedAlpha == null && !row.outcomeLabel) return <span className="text-2xs text-ink-3">未决议</span>;
      return (
        <span className="flex items-center gap-2">
          {/* realizedAlpha 是收益语义 → bull/bear 价格色（tokens.css 铁律允许的唯一场景） */}
          {row.realizedAlpha != null && (
            <span className={`num text-xs ${priceColorClass(row.realizedAlpha)}`}>{fmtPct(row.realizedAlpha)}</span>
          )}
          {row.outcomeLabel && <Badge variant={outcomeMeta[row.outcomeLabel].variant}>{outcomeMeta[row.outcomeLabel].label}</Badge>}
        </span>
      );
    },
  },
];

export function GraveyardTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const reason = parseReason(searchParams.get("reason"));
  const graveyardQuery = useGraveyardInfinite(reason);

  const setReason = (next: ReasonFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set("reason", next);
    } else {
      params.delete("reason");
    }
    setSearchParams(params);
  };

  if (graveyardQuery.isLoading) return <LoadingBlock label="加载墓地档案…" />;

  const pages = graveyardQuery.data?.pages ?? [];
  const summary = pages[0]?.summary;
  const entries = pages.flatMap((page) => page.entries);
  const total = pages[pages.length - 1]?.total ?? 0;

  if (!summary || summary.total === 0) {
    return (
      <EmptyState
        icon={Skull}
        title="墓地为空"
        hint="候选被淘汰（未达门槛 / 触发否决 / 降权 / 人工否决）时会记录到 data/graveyard.json——淘汰决策同样要接受事后检验。"
      />
    );
  }

  return (
    <section aria-label="墓地档案" className="space-y-4">
      <SummaryBlock summary={summary} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills options={FILTER_OPTIONS} value={reason} onChange={setReason} aria-label="按埋葬理由过滤" />
        <span className="num text-2xs text-ink-3">
          已加载 {entries.length} / {total}
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(row) => `${row.code}-${row.buriedAt}`}
        empty={
          <EmptyState
            icon={Skull}
            title={reason ? `没有「${graveyardReasonMeta[reason].label}」理由的条目` : "暂无条目"}
            hint="切换到「全部」查看其他理由的埋葬记录。"
            className="min-h-[10rem]"
          />
        }
      />

      {graveyardQuery.hasNextPage && (
        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={() => void graveyardQuery.fetchNextPage()}
            disabled={graveyardQuery.isFetchingNextPage}
            className="rounded-btn border border-line px-4 py-1.5 text-xs text-ink-2 transition-colors duration-fast ease-smooth hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {graveyardQuery.isFetchingNextPage ? "加载中…" : `加载更多（每页 ${PAGE_SIZE} 条）`}
          </button>
        </div>
      )}
    </section>
  );
}
