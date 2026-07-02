// 近 N 日梯队趋势卡（/api/ladder/history）：LadderTrend 双轴 mini 图 + 空态。
// 历史快照由服务端每次抓取当日梯队后落盘 runs/ladder/<date>.json 累积而来。
import { History } from "lucide-react";
import { LadderTrend } from "@/components/charts/LadderTrend";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useLadderHistory } from "@/lib/useSharedQueries";

const HISTORY_DAYS = 20;

export function LadderHistorySpark() {
  const { data, isLoading } = useLadderHistory(HISTORY_DAYS);
  const points = data ?? [];

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <SectionTitle
        icon={History}
        title={`近${HISTORY_DAYS}日趋势`}
        hint={points.length > 0 ? `${points.length} 日快照` : undefined}
      />
      {isLoading ? (
        <div className="grid h-48 place-items-center text-xs text-ink-3" role="status">
          加载中…
        </div>
      ) : points.length < 2 ? (
        <EmptyState
          icon={History}
          title="历史快照不足"
          hint="每次抓取当日梯队后自动落盘 runs/ladder/，累积 2 日以上即可展示涨停家数与炸板率趋势。"
          className="min-h-[10rem] px-2 py-6"
        />
      ) : (
        <>
          <LadderTrend points={points} />
          <p className="mt-2 text-2xs leading-relaxed text-ink-3">
            炸板率缺失（来源未提供）的交易日留空档，不以 0 臆造。
          </p>
        </>
      )}
    </section>
  );
}
