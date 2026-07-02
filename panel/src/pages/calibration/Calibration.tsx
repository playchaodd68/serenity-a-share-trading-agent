// 校准页（蓝图 §2.5）：预测质量的自我审计。两层数据源分区展示、不混淆：
// 过程校准（runs/calibration-latest.json）× 结果校准（runs/resolutions.json）+ DecisionLogStrip。
// 版式复用 Dashboard 的 SectionTitle + 卡片语法（本页为原创页，无参考项目对应）。
import type { LucideIcon } from "lucide-react";
import { Activity, Target } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtDateTime } from "@/lib/format";
import { useCalibration, useResolutions } from "@/lib/useSharedQueries";
import { DecisionLogStrip } from "./DecisionLogStrip";
import { OutcomeSection } from "./OutcomeSection";
import { ProcessSection } from "./ProcessSection";

/** 区块级标题：比卡片内 SectionTitle 高一级，承担"过程 × 结果"的分区语义。 */
function ZoneHeading({
  id,
  icon: Icon,
  title,
  hint,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
      <h2 id={id} className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
        <Icon className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden />
        {title}
      </h2>
      {hint && <span className="num text-2xs text-ink-3">{hint}</span>}
    </div>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-[8rem] place-items-center text-sm text-ink-3" role="status">
      {label}
    </div>
  );
}

export default function Calibration() {
  const calibrationQuery = useCalibration();
  const resolutionsQuery = useResolutions();
  const snapshot = calibrationQuery.data ?? null;
  const resolutions = resolutionsQuery.data;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="校准" subtitle="预测质量的自我审计 · 过程 × 结果" />

      <div className="flex-1 space-y-8 px-5 py-4">
        <DecisionLogStrip />

        <section aria-labelledby="calibration-process">
          <ZoneHeading
            id="calibration-process"
            icon={Activity}
            title="过程校准 · 评分与证据分布"
            hint={snapshot ? <>快照生成于 {fmtDateTime(snapshot.generatedAt)}</> : undefined}
          />
          {calibrationQuery.isLoading ? (
            <SectionLoading label="加载过程校准快照中…" />
          ) : snapshot ? (
            <ProcessSection snapshot={snapshot} />
          ) : (
            <EmptyState
              icon={Activity}
              title="尚无过程校准快照"
              hint={
                <>
                  快照读取 <code className="num text-xs">runs/calibration-latest.json</code>，运行{" "}
                  <code className="num text-xs">npm run calibration</code> 从历史筛选批次生成。
                </>
              }
              className="min-h-[12rem] py-10"
            />
          )}
        </section>

        <section aria-labelledby="calibration-outcome">
          <ZoneHeading
            id="calibration-outcome"
            icon={Target}
            title="结果校准 · 决议兑现"
            hint={
              resolutions?.calibration ? (
                <>
                  {resolutions.calibration.resolved} 个决议 · 生成于 {fmtDateTime(resolutions.calibration.generatedAt)}
                </>
              ) : undefined
            }
          />
          {resolutionsQuery.isLoading ? (
            <SectionLoading label="加载决议数据中…" />
          ) : resolutions ? (
            <OutcomeSection data={resolutions} />
          ) : (
            <EmptyState
              icon={Target}
              title="决议数据不可用"
              hint="无法读取 /api/resolutions —— 请确认 panel-server 已启动。"
              className="min-h-[12rem] py-10"
            />
          )}
        </section>
      </div>
    </div>
  );
}
