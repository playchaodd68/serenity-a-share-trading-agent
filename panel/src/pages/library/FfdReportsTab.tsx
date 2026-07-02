// FFD 卖方研报清单：status 五态过滤（URL ?ffdStatus=），
// 行内展示 title/institution/industry/publishedAt/claimCount/summary/tags。
import { FileText } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtDate } from "@/lib/format";
import type { FfdReportManifest, FfdReportStatus } from "@/lib/types";
import { useFfdReports } from "@/lib/useSharedQueries";
import { FFD_STATUSES, ffdStatusMeta } from "./labels";
import { FilterPills, LoadingBlock } from "./primitives";

const MAX_VISIBLE_TAGS = 4;

type FfdFilter = FfdReportStatus | "";

const FILTER_OPTIONS: ReadonlyArray<{ value: FfdFilter; label: string }> = [
  { value: "", label: "全部" },
  ...FFD_STATUSES.map((status) => ({ value: status, label: ffdStatusMeta[status].label })),
];

function parseFilter(raw: string | null): FfdFilter {
  return raw && (FFD_STATUSES as readonly string[]).includes(raw) ? (raw as FfdReportStatus) : "";
}

function ReportRow({ report }: { report: FfdReportManifest }) {
  const statusMeta = ffdStatusMeta[report.status] ?? { label: report.status, variant: "outline" as const };
  const metaParts = [
    report.institution,
    report.industry,
    report.publishedAt ? `发布于 ${fmtDate(report.publishedAt)}` : undefined,
  ].filter(Boolean);

  return (
    <li className="border-b border-line/60 px-3 py-3 transition-colors duration-fast ease-smooth last:border-0 hover:bg-raised/50">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-ink">{report.title}</p>
          <p className="mt-0.5 text-2xs text-ink-3">
            {metaParts.length > 0 ? metaParts.join(" · ") : "来源信息缺失"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="num text-2xs text-ink-2" title="抽取的结构化断言数">
            断言 {report.claimCount}
          </span>
          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        </div>
      </div>
      {report.summary && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-2">{report.summary}</p>}
      {report.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {report.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
            <Badge key={tag} variant="muted">
              {tag}
            </Badge>
          ))}
          {report.tags.length > MAX_VISIBLE_TAGS && (
            <Badge variant="muted" title={report.tags.slice(MAX_VISIBLE_TAGS).join("；")}>
              +{report.tags.length - MAX_VISIBLE_TAGS}
            </Badge>
          )}
        </div>
      )}
    </li>
  );
}

export function FfdReportsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get("ffdStatus"));
  const reportsQuery = useFfdReports(filter || undefined);

  const setFilter = (next: FfdFilter) => {
    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set("ffdStatus", next);
    } else {
      params.delete("ffdStatus");
    }
    setSearchParams(params);
  };

  const reports = reportsQuery.data ?? [];

  return (
    <section aria-label="FFD 研报清单">
      <SectionTitle
        icon={FileText}
        title="FFD 卖方研报"
        hint={!reportsQuery.isLoading && reports.length > 0 ? `${reports.length} 篇` : undefined}
      />
      <div className="mb-3">
        <FilterPills options={FILTER_OPTIONS} value={filter} onChange={setFilter} aria-label="按状态过滤研报" />
      </div>

      {reportsQuery.isLoading ? (
        <LoadingBlock label="加载研报清单…" />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filter ? `没有「${ffdStatusMeta[filter].label}」状态的研报` : "暂无已处理研报"}
          hint={
            filter ? (
              "切换到「全部」查看其他状态的研报。"
            ) : (
              <>
                将 PDF 研报放入 reports/inbox 后运行{" "}
                <code className="num rounded-input bg-raised px-1.5 py-0.5 text-xs">npm run reports:convert</code>
                ，处理产物（manifest）会出现在 reports/ffd/processed 并在此列出。
              </>
            )
          }
        />
      ) : (
        <ul className="rounded-card border border-line bg-surface">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </ul>
      )}
    </section>
  );
}
