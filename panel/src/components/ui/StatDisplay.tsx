// display 数字层（蓝图 §1.1-1 层级对比）：核心 KPI 用 --text-display 的 mono 大数字，
// 不加卡片框、直接裸排 + 细分隔线，与 12px 密表形成 3 倍以上字号跨度。
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface StatDisplayProps {
  label: string;
  /** 已格式化的数字文本（调用方用 lib/format.ts 格式化）。 */
  value: ReactNode;
  /** 副行：与基准对比、说明等。 */
  sub?: ReactNode;
  /**
   * 数字色调。价格/收益语义色（bull/bear）由调用方经 priceColorClass 传入；
   * 此处仅提供 UI 语义档位。
   */
  tone?: "default" | "accent" | "warning" | "danger" | "muted";
  /** 额外的数字 className（如 priceColorClass 结果）。 */
  valueClassName?: string;
  className?: string;
}

const toneClass: Record<NonNullable<StatDisplayProps["tone"]>, string> = {
  default: "text-ink",
  accent: "text-accent",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-ink-3",
};

export function StatDisplay({ label, value, sub, tone = "default", valueClassName, className }: StatDisplayProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-2xs uppercase tracking-wider text-ink-3">{label}</div>
      <div className={cn("num mt-1 text-display font-medium leading-none", toneClass[tone], valueClassName)}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}
