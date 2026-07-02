// Adapted from tickflow-stock-panel (MIT) — title/subtitle/right 三槽页头（近乎逐一复刻）。
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** 标题右侧、subtitle 之前的额外节点（如状态徽标）。 */
  titleExtra?: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, titleExtra, right, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 border-b border-line px-5 pb-2 pt-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-ink">{title}</h1>
        {titleExtra}
        {subtitle && <span className="text-xs text-ink-3">{subtitle}</span>}
      </div>
      {right}
    </header>
  );
}
