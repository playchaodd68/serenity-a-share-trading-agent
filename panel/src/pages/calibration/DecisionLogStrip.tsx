// DecisionLogStrip（蓝图 §2.5）：决策日志总数 / pending / resolved / validatedRate 横条。
import { ClipboardList } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtPct, NA } from "@/lib/format";
import { useDecisionLog } from "@/lib/useSharedQueries";

function StripItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xs uppercase tracking-wider text-ink-3">{label}</span>
      <span className={cn("num text-sm font-medium text-ink", className)}>{value}</span>
    </div>
  );
}

export function DecisionLogStrip() {
  const { data } = useDecisionLog();
  const summary = data?.summary;

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-card border border-line bg-surface px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
        <ClipboardList className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden />
        决策日志
      </span>
      <StripItem label="总数" value={summary ? String(summary.total) : NA} />
      <StripItem label="待决议" value={summary ? String(summary.pending) : NA} className={summary && summary.pending > 0 ? "text-warning" : undefined} />
      <StripItem label="已决议" value={summary ? String(summary.resolved) : NA} />
      <StripItem
        label="验证率"
        value={summary?.validatedRate != null ? fmtPct(summary.validatedRate, 1, false) : NA}
      />
      {summary && summary.total === 0 && (
        <span className="text-xs text-ink-3">尚无决策记录 —— 每次 screen 入选会自动登记。</span>
      )}
    </div>
  );
}
