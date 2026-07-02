// LadderMiniCard — 右栏连板梯队迷你卡（蓝图 §2.1 / §1.1-4）：
// 整卡采用 warning 琥珀框架 —— 按 Serenity 方法论，梯队高度是「负面拥挤度信号」，
// 不允许借用 bull 红色的"强势"暗示；空态亦保留琥珀框架与标注。
import { ArrowUpRight, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Sparkline } from "@/components/ui/Sparkline";
import { NA, fmtPct } from "@/lib/format";
import { useLadderHistory } from "@/lib/useSharedQueries";
import type { OverviewResponse } from "@/lib/types";

interface LadderMiniCardProps {
  ladder: OverviewResponse["ladder"];
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-btn bg-raised px-2 py-1.5">
      <div className="text-2xs text-ink-3">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-warning">{value}</div>
    </div>
  );
}

export function LadderMiniCard({ ladder }: LadderMiniCardProps) {
  const history = useLadderHistory(20);
  const trend = (history.data ?? []).map((point) => point.stats.limitUpCount);

  return (
    <section
      aria-label="连板梯队（负面拥挤度信号）"
      className="rounded-card border border-warning/40 bg-surface p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <Flame className="h-4 w-4 text-warning" strokeWidth={1.75} aria-hidden />
          连板梯队
        </h2>
        {ladder && <span className="num text-2xs text-ink-3">{ladder.date}</span>}
      </div>
      <Badge variant="warning">负面拥挤度信号</Badge>

      {!ladder ? (
        <p className="mt-3 rounded-card border border-dashed border-warning/30 px-3 py-5 text-center text-xs leading-relaxed text-ink-3">
          今日梯队快照未生成 — 访问「连板梯队」页将抓取当日快照。
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <MiniMetric label="涨停家数" value={String(ladder.limitUpCount)} />
            <MiniMetric label="炸板率" value={ladder.brokenRate == null ? NA : fmtPct(ladder.brokenRate, 1, false)} />
            <MiniMetric label="最高连板" value={`${ladder.maxHeight}板`} />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-2xs text-ink-3">近 20 日涨停家数</div>
            <Sparkline
              values={trend}
              width={272}
              height={32}
              fill
              className="w-full text-warning"
              aria-label="近 20 日涨停家数趋势"
            />
          </div>
        </>
      )}

      <p className="mt-3 text-2xs leading-relaxed text-ink-3">
        梯队越高、情绪越热，方法论上越要求对相关方向降权；本卡不构成买入信号。
      </p>
      <Link
        to="/ladder"
        className="mt-2 inline-flex items-center gap-1 text-xs text-accent transition-colors duration-fast ease-smooth hover:text-ink"
      >
        查看梯队
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  );
}
