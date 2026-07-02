// 候选评分 trace 展开行：先验→后验→期望值评分链、评分构成条、
// 覆盖缺口 / 风险 / 负面信号、炒作与一票否决、否决条件与催化剂、证据链。
// 仅展示 MethodologyTrace 已有字段，不引入任何新的评分概念（蓝图铁律）。
import { ArrowRight } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { fmtNum } from "@/lib/format";
import type { MethodologyTrace } from "@/lib/types";
import { CatalystList, KillCriterionList } from "./CriterionList";
import { confidenceLabels, polarityMeta, signedNum, tierVariant } from "./labels";
import { Collapse, SectionLabel } from "./primitives";

function ScoreStep({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-2xs text-ink-3">{label}</span>
      <span className="num text-base font-medium text-ink">{fmtNum(value, 1)}</span>
    </span>
  );
}

function ChipRow({ label, items, variant }: { label: string; items: string[]; variant: "warning" | "danger" }) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant={variant} className="whitespace-normal text-left leading-relaxed">
            {item}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function TextList({ label, items, ordered = false }: { label: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const ListTag = ordered ? "ol" : "ul";
  return (
    <section>
      <SectionLabel>{label}</SectionLabel>
      <ListTag
        className={cn(
          "mt-1.5 space-y-1 pl-4 text-xs leading-relaxed text-ink-2",
          ordered ? "list-decimal" : "list-disc",
        )}
      >
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ListTag>
    </section>
  );
}

export function TraceDetail({ trace }: { trace: MethodologyTrace }) {
  return (
    <div className="space-y-4 rounded-card border border-line bg-base/60 p-4">
      {/* ===== 评分链 ===== */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {(
          [
            ["先验", trace.priorScore],
            ["后验", trace.posteriorScore],
            ["期望值", trace.expectedValueScore],
          ] as const
        ).map(([label, value], index) => (
          <Fragment key={label}>
            {index > 0 && <ArrowRight className="h-3.5 w-3.5 text-ink-3" aria-hidden />}
            <ScoreStep label={label} value={value} />
          </Fragment>
        ))}
        {trace.confidenceCeiling && (
          <Badge variant="warning" title={trace.ceilingReasons?.join("；")}>
            置信度上限 {confidenceLabels[trace.confidenceCeiling]}
          </Badge>
        )}
        {trace.disqualifiers?.triggered && <Badge variant="danger">一票否决触发</Badge>}
        {trace.hypeRisk?.reflexivityFlag && <Badge variant="danger">反身性风险</Badge>}
      </div>

      {/* ===== 行业逻辑（若有） ===== */}
      {trace.industryLogic && (
        <section className="rounded-card border border-line bg-surface px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <SectionLabel>行业逻辑</SectionLabel>
            <span className="num text-2xs text-ink-2">总分 {fmtNum(trace.industryLogic.totalScore, 1)}</span>
            <span className="text-2xs text-ink-3">验证窗口：{trace.industryLogic.validationWindow}</span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{trace.industryLogic.thesis}</p>
        </section>
      )}

      {/* ===== 评分构成 ===== */}
      {trace.components.length > 0 && (
        <section>
          <SectionLabel>评分构成</SectionLabel>
          <ul className="mt-2 space-y-2.5">
            {trace.components.map((component) => {
              const ratio = component.maxScore > 0 ? Math.max(0, Math.min(1, component.score / component.maxScore)) : 0;
              return (
                <li key={component.name} className="grid grid-cols-[11rem_minmax(0,1fr)] items-start gap-3 max-md:grid-cols-1">
                  <span className="num pt-0.5 text-2xs text-ink-2">{component.name}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-raised" aria-hidden>
                        <span className="block h-full rounded-pill bg-accent" style={{ width: `${ratio * 100}%` }} />
                      </span>
                      <span className="num shrink-0 text-2xs text-ink-2">
                        {fmtNum(component.score, 0)}/{fmtNum(component.maxScore, 0)}
                      </span>
                    </div>
                    <p className="mt-1 text-2xs leading-relaxed text-ink-3">{component.reason}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ChipRow label="覆盖缺口" items={trace.coverageGaps} variant="warning" />
      <ChipRow label="负面信号" items={trace.negativeSignals ?? []} variant="danger" />
      <ChipRow label="供给释放信号" items={trace.supplyReleaseSignals ?? []} variant="warning" />
      <TextList label="风险" items={trace.risks} />
      <TextList label="下一步行动" items={trace.nextActions ?? []} ordered />

      {/* ===== 炒作风险 / 一票否决细节 ===== */}
      {trace.hypeRisk && trace.hypeRisk.hitSignals.length > 0 && (
        <section>
          <SectionLabel>炒作风险信号</SectionLabel>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {trace.hypeRisk.hitSignals.map((signal) => (
              <Badge key={signal} variant="warning">
                {signal}
              </Badge>
            ))}
            <span className="num text-2xs text-ink-3">评分惩罚 {signedNum(-Math.abs(trace.hypeRisk.penalty))}</span>
          </div>
        </section>
      )}
      {trace.disqualifiers && trace.disqualifiers.hitSignals.length > 0 && (
        <ChipRow label="一票否决信号" items={trace.disqualifiers.hitSignals} variant="danger" />
      )}

      {/* ===== 折叠区：否决条件 / 催化剂 / 证据链 ===== */}
      {(trace.killCriteria?.length ?? 0) > 0 && (
        <Collapse title="否决条件" count={trace.killCriteria!.length}>
          <KillCriterionList items={trace.killCriteria!} />
        </Collapse>
      )}
      {(trace.catalysts?.length ?? 0) > 0 && (
        <Collapse title="催化剂" count={trace.catalysts!.length}>
          <CatalystList items={trace.catalysts!} />
        </Collapse>
      )}
      {trace.evidence.length > 0 && (
        <Collapse title="证据链" count={trace.evidence.length}>
          <ul className="space-y-3">
            {trace.evidence.map((item) => (
              <li key={item.id} className="space-y-1 border-b border-line/60 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={tierVariant[item.tier]}>{item.tier}</Badge>
                  <span className={cn("text-2xs", polarityMeta[item.polarity].className)}>
                    {polarityMeta[item.polarity].label}
                  </span>
                  <span className="num text-2xs text-ink-3">权重 {fmtNum(item.weight, 0)}</span>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-ink" title={item.title}>
                  {item.title}
                </p>
                {item.description && (
                  <p className="line-clamp-3 text-2xs leading-relaxed text-ink-3">{item.description}</p>
                )}
              </li>
            ))}
          </ul>
        </Collapse>
      )}
    </div>
  );
}
