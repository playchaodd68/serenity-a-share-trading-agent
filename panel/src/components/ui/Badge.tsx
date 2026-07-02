// 徽标：watchlist 五态 + 通用 UI 语义档。
// 注意：这些是 UI 状态色，与 bull/bear 价格语义色严格分离（tokens.css 铁律）——
// 因此 validated 用高对比 solid 而非绿色，downgraded 用 danger 而非 bear。
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { WatchlistStatus } from "@/lib/types";

export type BadgeVariant = "accent" | "warning" | "danger" | "muted" | "solid" | "outline";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
  title?: string;
}

const variantClass: Record<BadgeVariant, string> = {
  accent: "border-transparent bg-accent/15 text-accent",
  warning: "border-transparent bg-warning/15 text-warning",
  danger: "border-transparent bg-danger/15 text-danger",
  muted: "border-transparent bg-raised text-ink-3",
  solid: "border-transparent bg-ink text-base",
  outline: "border-line-strong bg-transparent text-ink-2",
};

export function Badge({ variant = "outline", children, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-pill border px-2 py-0.5 text-2xs font-medium leading-4",
        variantClass[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ===== Watchlist 五态映射（evidence-needed/investigating/validated/downgraded/archived） =====

const watchlistStatusMap: Record<WatchlistStatus, { label: string; variant: BadgeVariant }> = {
  "evidence-needed": { label: "待证据", variant: "warning" },
  investigating: { label: "调查中", variant: "accent" },
  validated: { label: "已验证", variant: "solid" },
  downgraded: { label: "已降权", variant: "danger" },
  archived: { label: "已归档", variant: "muted" },
};

export function watchlistStatusLabel(status: WatchlistStatus): string {
  return watchlistStatusMap[status]?.label ?? status;
}

export function WatchlistStatusBadge({ status, className }: { status: WatchlistStatus; className?: string }) {
  const conf = watchlistStatusMap[status] ?? { label: status, variant: "outline" as BadgeVariant };
  return (
    <Badge variant={conf.variant} className={className}>
      {conf.label}
    </Badge>
  );
}
