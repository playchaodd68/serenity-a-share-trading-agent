// 报告库目录内共用的小型 UI 原语：折叠区 / 小节标签 / 迷你指标 / 过滤 pills / 加载块。
// 仅供 pages/library/ 使用；如后续多页需要应上移 components/ui/（S3 切片不改共享目录）。
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// ===== 折叠区（killCriteria / catalysts / 证据链等收纳） =====

interface CollapseProps {
  title: string;
  /** 右侧等宽计数。 */
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export function Collapse({ title, count, defaultOpen = false, children, className }: CollapseProps) {
  return (
    <details open={defaultOpen} className={cn("group rounded-card border border-line bg-surface", className)}>
      <summary className="flex cursor-pointer select-none items-center gap-2 rounded-card px-3 py-2 text-xs font-medium text-ink-2 transition-colors duration-fast ease-smooth hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform duration-fast ease-smooth group-open:rotate-90"
          aria-hidden
        />
        {title}
        {count !== undefined && <span className="num text-2xs text-ink-3">{count}</span>}
      </summary>
      <div className="border-t border-line px-3 py-2.5">{children}</div>
    </details>
  );
}

// ===== 小节标签（trace 展开行 / 抽屉内分节） =====

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-2xs font-medium uppercase tracking-wider text-ink-3">{children}</div>;
}

// ===== 迷你指标卡（evidenceState 四指标等） =====

interface MiniStatProps {
  label: string;
  value: ReactNode;
  tone?: "default" | "accent" | "warning" | "muted";
}

const miniStatTone: Record<NonNullable<MiniStatProps["tone"]>, string> = {
  default: "text-ink",
  accent: "text-accent",
  warning: "text-warning",
  muted: "text-ink-3",
};

export function MiniStat({ label, value, tone = "default" }: MiniStatProps) {
  return (
    <div className="rounded-card border border-line bg-surface px-3 py-2">
      <div className="text-2xs text-ink-3">{label}</div>
      <div className={cn("num mt-0.5 text-lg font-medium leading-tight", miniStatTone[tone])}>{value}</div>
    </div>
  );
}

// ===== 过滤 pills（FFD status / 墓地 reason） =====

interface FilterPillsProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
}

export function FilterPills<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: FilterPillsProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-pill border px-2.5 py-1 text-xs transition-colors duration-fast ease-smooth",
            option.value === value
              ? "border-accent bg-accent/15 font-medium text-accent"
              : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ===== 加载块 =====

export function LoadingBlock({ label = "加载中…" }: { label?: string }) {
  return (
    <div role="status" className="grid min-h-[10rem] place-items-center py-12 text-sm text-ink-3">
      {label}
    </div>
  );
}
