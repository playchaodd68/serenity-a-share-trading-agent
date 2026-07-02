// Adapted from tickflow-stock-panel (MIT) — Review.tsx 的「正文 + 侧栏」双栏阅读骨架。
// 批次详情：左侧候选表（trace 展开行），右侧纸面阅读面渲染配对 markdown 报告。
import { ChevronLeft, Layers, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtDateTime } from "@/lib/format";
import { useScreen, useScreenReport } from "@/lib/useSharedQueries";
import { CandidateTable } from "./CandidateTable";
import { LoadingBlock } from "./primitives";
import { ReadingPane } from "./ReadingPane";

interface ScreenRunDetailProps {
  runId: string;
  onBack: () => void;
}

export function ScreenRunDetail({ runId, onBack }: ScreenRunDetailProps) {
  const runQuery = useScreen(runId);
  const reportQuery = useScreenReport(runId);

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1 rounded-btn px-2 py-1 text-xs text-ink-2 transition-colors duration-fast ease-smooth hover:bg-raised hover:text-ink"
    >
      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      返回批次列表
    </button>
  );

  if (runQuery.isLoading) {
    return (
      <div>
        {backButton}
        <LoadingBlock label="加载批次详情…" />
      </div>
    );
  }

  const run = runQuery.data;
  if (!run) {
    return (
      <div>
        {backButton}
        <EmptyState
          icon={Layers}
          title="未找到该批次"
          hint={
            <>
              批次 <span className="num text-xs">{runId}</span> 的 JSON 工件不存在或已被清理。
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ===== 批次元信息条 ===== */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {backButton}
        <span className="num text-xs text-ink">{run.runId}</span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-3">
          <span>
            生成于 <span className="num">{fmtDateTime(run.generatedAt)}</span>
          </span>
          <span>
            候选 <span className="num text-ink-2">{run.candidates.length}</span>
          </span>
          <span>
            扫描 <span className="num text-ink-2">{run.totalStocksScanned}</span> 只
          </span>
          <span>
            来源 <span className="num text-ink-2">{run.sourceCount}</span>
          </span>
        </span>
      </div>

      {/* ===== 左候选表 + 右纸面阅读面 ===== */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,44rem)]">
        <section aria-label="批次候选" className="min-w-0">
          <SectionTitle icon={Users} title="候选" hint={`${run.candidates.length} 只`} />
          {run.candidates.length === 0 ? (
            <EmptyState
              icon={Users}
              title="本批次没有候选"
              hint="扫描完成但无股票通过筛选门槛；可在右侧报告原文中查看主题与门槛说明。"
              className="min-h-[10rem]"
            />
          ) : (
            <CandidateTable candidates={run.candidates} />
          )}
        </section>

        <ReadingPane
          className="min-w-0 xl:sticky xl:top-4"
          title={`${run.runId}.md`}
          markdown={reportQuery.data}
          loading={reportQuery.isLoading}
          error={reportQuery.isError}
        />
      </div>
    </div>
  );
}
