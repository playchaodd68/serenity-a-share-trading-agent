// EvidenceQueueCard — 右栏证据补齐队列迷你卡（2026-07-03 持仓误判复盘）：
// 先验画像达标但证据覆盖不足的候选，不再直接埋葬，进队列等材料补齐后再判。
// 数据 /api/evidence-queue（runs/evidence-queue.json 缺失时为 null → 空态）。
// 铁律：本卡只是"待读清单"，绝不是买入建议——副标题常驻声明，任何状态都不许省略。
import { BookOpenCheck } from "lucide-react";
import { fmtNum, fmtRelative } from "@/lib/format";
import { useEvidenceQueue } from "@/lib/useSharedQueries";
import type { EvidenceQueueEntry } from "@/lib/types";

const TOP_N = 5;

function QueueRow({ entry }: { entry: EvidenceQueueEntry }) {
  return (
    <li className="rounded-btn bg-raised px-2.5 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="num text-2xs text-ink-3">{entry.code}</span>
          <span className="truncate text-xs font-medium text-ink">{entry.name}</span>
        </span>
        <span className="num shrink-0 text-xs text-ink-2">{fmtNum(entry.score, 1)} 分</span>
      </div>
      {entry.matchedThemes.length > 0 && (
        <div className="mt-0.5 truncate text-2xs text-ink-3" title={entry.matchedThemes.join(" · ")}>
          {entry.matchedThemes.join(" · ")}
        </div>
      )}
    </li>
  );
}

export function EvidenceQueueCard() {
  const query = useEvidenceQueue();
  const queue = query.data ?? null;
  const entries = queue?.entries ?? [];

  return (
    <section aria-label="证据补齐队列" className="rounded-card border border-line bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <BookOpenCheck className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden />
          证据补齐队列
        </h2>
        {queue && <span className="num text-2xs text-ink-3">{fmtRelative(queue.updatedAt)}</span>}
      </div>
      <p className="mb-3 text-2xs leading-relaxed text-ink-3">
        先验达标但材料不足——补齐证据后再判，不是买入建议。
      </p>

      {query.isLoading ? (
        <p className="px-3 py-5 text-center text-xs text-ink-3" role="status">
          加载中…
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-3 py-5 text-center text-xs leading-relaxed text-ink-3">
          队列为空 — 当前批次没有「先验达标但证据覆盖不足」的候选，或{" "}
          <span className="num">runs/evidence-queue.json</span> 尚未生成。
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {entries.slice(0, TOP_N).map((entry) => (
              <QueueRow key={entry.code} entry={entry} />
            ))}
          </ul>
          {entries.length > TOP_N && (
            <p className="mt-2 text-2xs text-ink-3">
              共 <span className="num">{entries.length}</span> 条，仅显示评分前 {TOP_N}。
            </p>
          )}
        </>
      )}
    </section>
  );
}
