// killCriteria（否决条件）与 catalysts（催化剂）条款列表 —
// trace 展开行与 Watchlist 抽屉共用同一渲染，保证两处语义一致。
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import type { CatalystCriterion, KillCriterion } from "@/lib/types";
import { catalystCategoryLabels, killCategoryLabels, signedNum } from "./labels";

function DeltaTag({ delta }: { delta: number }) {
  return (
    <span
      className={cn("num text-2xs", delta < 0 ? "text-danger" : delta > 0 ? "text-accent" : "text-ink-3")}
      title="触发后对后验评分的调整量"
    >
      Δ后验 {signedNum(delta)}
    </span>
  );
}

export function KillCriterionList({ items }: { items: KillCriterion[] }) {
  const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <ul className="space-y-2.5">
      {sorted.map((item) => (
        <li key={item.id} className="space-y-1 border-b border-line/60 pb-2.5 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{killCategoryLabels[item.category] ?? item.category}</Badge>
            <span className="num text-2xs text-ink-3">截止 {fmtDate(item.dueDate)}</span>
            <DeltaTag delta={item.posteriorDelta} />
          </div>
          <p className="text-xs leading-relaxed text-ink-2">{item.trigger}</p>
          <p className="text-2xs leading-relaxed text-ink-3">核验：{item.sourceCheck}</p>
        </li>
      ))}
    </ul>
  );
}

export function CatalystList({ items }: { items: CatalystCriterion[] }) {
  const sorted = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <ul className="space-y-2.5">
      {sorted.map((item) => (
        <li key={item.id} className="space-y-1 border-b border-line/60 pb-2.5 last:border-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{catalystCategoryLabels[item.category] ?? item.category}</Badge>
            <span className="num text-2xs text-ink-3">截止 {fmtDate(item.dueDate)}</span>
            <DeltaTag delta={item.posteriorDelta} />
          </div>
          <p className="text-xs leading-relaxed text-ink-2">{item.trigger}</p>
          <p className="text-2xs leading-relaxed text-ink-3">确认：{item.confirms}</p>
          <p className="text-2xs leading-relaxed text-ink-3">核验：{item.sourceCheck}</p>
        </li>
      ))}
    </ul>
  );
}
