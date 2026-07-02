// LatestReportCard — 最新筛选报告摘要（蓝图 §2.1）：最新 screen-*.md 的纯文本节选
// + 批次元信息 + 跳转报告库。报告全文的纸面阅读面在报告库详情页（S3）。
import { ArrowUpRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtDateTime } from "@/lib/format";
import { useScreenReport } from "@/lib/useSharedQueries";
import type { OverviewResponse } from "@/lib/types";

interface LatestReportCardProps {
  latestRun: OverviewResponse["latestRun"];
}

const EXCERPT_MAX_CHARS = 320;

/** markdown → 纯文本节选：跳过标题/表格/分隔线，剥掉行内标记，取前若干字符。 */
function mdExcerpt(markdown: string): string {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^(#{1,6}\s|[-*_]{3,}\s*$|\||>)/.test(line));
  const plain = lines
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "");
  return plain.length > EXCERPT_MAX_CHARS ? `${plain.slice(0, EXCERPT_MAX_CHARS)}…` : plain;
}

export function LatestReportCard({ latestRun }: LatestReportCardProps) {
  const report = useScreenReport(latestRun?.runId);

  return (
    <section aria-label="最新筛选报告" className="flex flex-col rounded-card border border-line bg-surface p-4">
      <SectionTitle
        icon={FileText}
        title="最新筛选报告"
        hint={latestRun ? fmtDateTime(latestRun.generatedAt) : undefined}
        className="mb-3"
      />
      {!latestRun ? (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-xs leading-relaxed text-ink-3">
          尚未生成筛选报告 — 运行 <span className="num">npm run screen</span> 生成首个批次。
        </p>
      ) : (
        <>
          <div className="num text-2xs text-ink-3">
            {latestRun.runId} · 候选 {latestRun.candidateCount} · 扫描 {latestRun.totalStocksScanned} · 数据源{" "}
            {latestRun.sourceCount}
          </div>
          <p className="mt-2 line-clamp-5 flex-1 text-sm leading-relaxed text-ink-2">
            {report.isLoading ? "加载报告摘要…" : report.data ? mdExcerpt(report.data) : "报告原文缺失，仅批次数据可用。"}
          </p>
          <Link
            to="/library"
            className="mt-3 inline-flex items-center gap-1 self-start text-xs text-accent transition-colors duration-fast ease-smooth hover:text-ink"
          >
            进入报告库
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}
