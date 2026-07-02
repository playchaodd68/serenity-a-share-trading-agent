// Adapted from tickflow-stock-panel (MIT) — Dashboard 内嵌 SectionTitle 的
// 图标 + 小标题 + 右侧 mono hint 小节样式，抽为共享组件。
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SectionTitleProps {
  icon?: LucideIcon;
  title: string;
  /** 右侧等宽小字提示（如数据时间戳、计数）。 */
  hint?: ReactNode;
  className?: string;
}

export function SectionTitle({ icon: Icon, title, hint, className }: SectionTitleProps) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
        {Icon && <Icon className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden />}
        {title}
      </h2>
      {hint && <span className="num text-2xs text-ink-3">{hint}</span>}
    </div>
  );
}
