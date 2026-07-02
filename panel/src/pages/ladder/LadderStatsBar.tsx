// Adapted from tickflow-stock-panel (MIT) — LimitUpLadder OverviewBar 统计条版式；
// 语义框架为本项目原创：拥挤度=负面信号，brokenRate 是 display 主数字。
// 铁律：brokenCount / brokenRate 可能为 null（来源缺失）——渲染 n/a 并注明数据缺失，绝不显示成 0。
import { StatDisplay } from "@/components/ui/StatDisplay";
import { fmtPct } from "@/lib/format";
import type { LimitUpLadderStats } from "@/lib/types";

interface LadderStatsBarProps {
  stats: LimitUpLadderStats;
  /** 快照日期 YYYY-MM-DD。 */
  date: string;
}

const MISSING_NOTE = "数据缺失：来源未提供炸板数据";

export function LadderStatsBar({ stats, date }: LadderStatsBarProps) {
  const brokenMissing = stats.brokenCount == null;
  const rateMissing = stats.brokenRate == null;

  return (
    <section aria-label={`${date} 涨停梯队统计`}>
      <div className="grid grid-cols-2 gap-y-5 border-b border-line pb-4 sm:grid-cols-4 sm:divide-x sm:divide-line">
        <StatDisplay
          label="涨停家数"
          value={<span>{stats.limitUpCount}</span>}
          sub="当日触板（含炸板前）总数"
          className="sm:pr-4"
        />
        <StatDisplay
          label="炸板家数"
          value={brokenMissing ? "n/a" : String(stats.brokenCount)}
          tone={brokenMissing ? "muted" : "default"}
          sub={brokenMissing ? MISSING_NOTE : "开板后未回封"}
          className="sm:px-4"
        />
        <StatDisplay
          label="炸板率"
          value={rateMissing ? "n/a" : fmtPct(stats.brokenRate, 1, false)}
          tone={rateMissing ? "muted" : "warning"}
          sub={rateMissing ? MISSING_NOTE : "炸板 ÷（涨停 + 炸板）"}
          className="sm:px-4"
        />
        <StatDisplay
          label="最高连板"
          value={
            <span>
              {stats.maxHeight}
              <span className="ml-1 text-sm text-ink-3">板</span>
            </span>
          }
          tone="warning"
          sub="梯队高度 = 负面拥挤度上限"
          className="sm:pl-4"
        />
      </div>
    </section>
  );
}
