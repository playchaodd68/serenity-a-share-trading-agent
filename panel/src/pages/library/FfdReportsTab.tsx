// FFD 卖方研报清单：status 五态过滤（URL ?ffdStatus=），
// 行内展示 title/institution/industry/publishedAt/claimCount/summary/tags。
// 审核工作台：staged（待审核）行内「接受 / 拒绝」，工具栏「质量门批量接受 / 转换新研报」，
// 动作走 JobButton（POST /api/actions/reports-*），终态后清单自动刷新。
import { Check, FileInput, FileText, ShieldCheck, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { JobButton } from "@/components/ui/JobButton";
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

/** staged（待审核）行的审核操作：接受（确认框含强制接受勾选）/ 拒绝（danger + 确认）。 */
function ReportReviewActions({ report }: { report: FfdReportManifest }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <JobButton
        action="reports-accept"
        params={{ id: report.id }}
        label="接受"
        size="sm"
        variant="secondary"
        icon={Check}
        confirmTitle="接受研报"
        confirmText={`将「${report.title}」采纳入知识库。质量门未通过时任务会失败，可勾选下方选项跳过。`}
        confirmCheckbox={{ label: "强制接受（跳过质量门）", param: "force" }}
      />
      <JobButton
        action="reports-reject"
        params={{ id: report.id }}
        label="拒绝"
        size="sm"
        variant="secondary"
        danger
        icon={X}
        confirmTitle="拒绝研报"
        confirmText={`确认拒绝「${report.title}」？拒绝后标记为已拒绝，不进入知识库。`}
      />
    </div>
  );
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
      {report.status === "staged" && <ReportReviewActions report={report} />}
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <FilterPills options={FILTER_OPTIONS} value={filter} onChange={setFilter} aria-label="按状态过滤研报" />
        <div className="flex items-center gap-1.5" role="group" aria-label="研报批量操作">
          <JobButton
            action="reports-accept-quality"
            label="质量门批量接受"
            size="sm"
            variant="secondary"
            icon={ShieldCheck}
          />
          <JobButton action="reports-convert" label="转换新研报" size="sm" variant="secondary" icon={FileInput} />
        </div>
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
                将 PDF 研报放入 <code className="num rounded-input bg-raised px-1.5 py-0.5 text-xs">reports/inbox</code>{" "}
                后点击上方「转换新研报」，处理产物（manifest）会出现在 reports/ffd/processed 并在此列出。
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
