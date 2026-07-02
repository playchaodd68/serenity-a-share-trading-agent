// 空态：图示 + 引导文案（+ 可选操作），而不是一句"暂无数据"。
// 所有数据视图必须先做空态 — runs/ 工件可能不存在（蓝图工程红线）。
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /** 引导性说明：数据从哪来、怎么生成（如 `npm run quant:backtest`）。 */
  hint?: ReactNode;
  /** 可选操作区（按钮/链接）。 */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cn("grid h-full min-h-[16rem] place-items-center px-8 py-16", className)}>
      <div className="max-w-md text-center">
        <Icon className="mx-auto h-10 w-10 text-ink-3" strokeWidth={1.5} aria-hidden />
        <h2 className="mt-4 text-base font-medium text-ink">{title}</h2>
        {hint && <div className="mt-2 text-sm leading-relaxed text-ink-2">{hint}</div>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
