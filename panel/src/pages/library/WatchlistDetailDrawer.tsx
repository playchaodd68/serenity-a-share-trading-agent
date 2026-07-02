// Watchlist 条目详情抽屉：证据状态四指标、覆盖缺口 chips、下一步行动、
// 否决条件 / 催化剂折叠区、事件时间线（蓝图 §2.3-2）。
import { Badge, WatchlistStatusBadge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Drawer";
import { cn } from "@/lib/cn";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import type { WatchlistEntry } from "@/lib/types";
import { CatalystList, KillCriterionList } from "./CriterionList";
import { confidenceLabels, eventTypeLabels } from "./labels";
import { Collapse, MiniStat, SectionLabel } from "./primitives";

/** 事件时间线最多显示条数（"updated/review-scheduled" 高频事件防刷屏）。 */
const MAX_TIMELINE_EVENTS = 30;

interface WatchlistDetailDrawerProps {
  entry: WatchlistEntry | null;
  onClose: () => void;
}

export function WatchlistDetailDrawer({ entry, onClose }: WatchlistDetailDrawerProps) {
  return (
    <Drawer
      open={entry !== null}
      onClose={onClose}
      title={entry ? `${entry.name} · ${entry.code}` : undefined}
      widthClassName="w-[30rem]"
    >
      {entry && <DrawerBody entry={entry} />}
    </Drawer>
  );
}

function DrawerBody({ entry }: { entry: WatchlistEntry }) {
  const isOverdue = new Date(entry.nextReviewAt).getTime() < Date.now();
  const timeline = [...entry.events].reverse();
  const shown = timeline.slice(0, MAX_TIMELINE_EVENTS);

  return (
    <div className="space-y-5">
      {/* ===== 概览 ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <WatchlistStatusBadge status={entry.status} />
        <span className="num text-lg font-medium text-ink">{fmtNum(entry.score, 1)}</span>
        <span className="text-2xs text-ink-3">置信度 {confidenceLabels[entry.confidence]}</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-2xs max-sm:grid-cols-1">
        <div>
          <dt className="text-ink-3">首次入选</dt>
          <dd className="num mt-0.5 text-ink-2">{fmtDate(entry.firstSeenAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">最近出现</dt>
          <dd className="num mt-0.5 text-ink-2">{fmtDate(entry.lastSeenAt)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">下次复核</dt>
          <dd className={cn("num mt-0.5", isOverdue ? "text-warning" : "text-ink-2")}>
            {fmtDate(entry.nextReviewAt)}
            {isOverdue && " · 已到期"}
          </dd>
        </div>
      </dl>

      {/* ===== 证据状态四指标 ===== */}
      <section aria-label="证据状态">
        <SectionLabel>证据状态</SectionLabel>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <MiniStat
            label="候选级 P0"
            value={entry.evidenceState.hasCandidateP0 ? "有" : "无"}
            tone={entry.evidenceState.hasCandidateP0 ? "accent" : "muted"}
          />
          <MiniStat label="直接证据" value={entry.evidenceState.directEvidenceCount} />
          <MiniStat label="佐证证据" value={entry.evidenceState.corroboratingEvidenceCount} />
          <MiniStat
            label="风险证据"
            value={entry.evidenceState.riskEvidenceCount}
            tone={entry.evidenceState.riskEvidenceCount > 0 ? "warning" : "muted"}
          />
        </div>
      </section>

      {/* ===== 覆盖缺口 ===== */}
      <section aria-label="覆盖缺口">
        <SectionLabel>覆盖缺口</SectionLabel>
        {entry.coverageGaps.length === 0 ? (
          <p className="mt-1.5 text-2xs text-ink-3">无缺口</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {entry.coverageGaps.map((gap) => (
              <Badge key={gap} variant="warning" className="whitespace-normal text-left leading-relaxed">
                {gap}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* ===== 下一步行动 ===== */}
      {entry.nextActions.length > 0 && (
        <section aria-label="下一步行动">
          <SectionLabel>下一步行动</SectionLabel>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-ink-2">
            {entry.nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ol>
        </section>
      )}

      {/* ===== 否决条件 / 催化剂折叠区 ===== */}
      {(entry.killCriteria?.length ?? 0) > 0 && (
        <Collapse title="否决条件" count={entry.killCriteria!.length}>
          <KillCriterionList items={entry.killCriteria!} />
        </Collapse>
      )}
      {(entry.catalysts?.length ?? 0) > 0 && (
        <Collapse title="催化剂" count={entry.catalysts!.length}>
          <CatalystList items={entry.catalysts!} />
        </Collapse>
      )}

      {/* ===== 事件时间线 ===== */}
      <section aria-label="事件时间线">
        <div className="flex items-baseline gap-2">
          <SectionLabel>事件时间线</SectionLabel>
          <span className="num text-2xs text-ink-3">{timeline.length} 条</span>
        </div>
        {timeline.length === 0 ? (
          <p className="mt-1.5 text-2xs text-ink-3">暂无事件记录</p>
        ) : (
          <>
            <ol className="mt-3 space-y-3 border-l border-line pl-4">
              {shown.map((event, index) => (
                <li key={`${event.at}-${index}`} className="relative">
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -left-[21px] top-1 h-2 w-2 rounded-pill",
                      event.type === "kill-triggered" ? "bg-danger" : "bg-line-strong",
                    )}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-2xs text-ink-3">{fmtDateTime(event.at)}</span>
                    <Badge variant={event.type === "kill-triggered" ? "danger" : "muted"}>
                      {eventTypeLabels[event.type] ?? event.type}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{event.detail}</p>
                </li>
              ))}
            </ol>
            {timeline.length > MAX_TIMELINE_EVENTS && (
              <p className="mt-2 text-2xs text-ink-3">仅显示最近 {MAX_TIMELINE_EVENTS} 条，更早事件见 data/watchlist.json。</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
