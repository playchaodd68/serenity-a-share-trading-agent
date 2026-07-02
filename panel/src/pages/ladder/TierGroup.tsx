// Adapted from tickflow-stock-panel (MIT) — 按连板高度分层折叠 + auto-fill 卡片矩阵版式。
// 语义框架为本项目原创：琥珀单色阶（越高越实），无红色热度渐变、无监控/盯盘功能。
import { useState } from "react";
import { ChevronDown, Flame } from "lucide-react";
import { cn } from "@/lib/cn";
import { LimitUpStockCard } from "@/pages/ladder/LimitUpStockCard";
import { tierAlpha, tierLabel, tierLabelColor, warningMix } from "@/pages/ladder/tierTone";
import type { LadderTier } from "@/lib/types";

interface TierGroupProps {
  tier: LadderTier;
  defaultOpen?: boolean;
}

export function TierGroup({ tier, defaultOpen = true }: TierGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const labelColor = tierLabelColor(tier.height);
  const contentId = `tier-group-${tier.height}`;

  return (
    <section
      className="rounded-r-card bg-surface/55"
      style={{
        // 左侧琥珀条按连板高度动态取档，只有它需要留在内联样式
        borderLeft: `2px solid ${warningMix(tierAlpha(tier.height))}`,
      }}
      aria-label={`${tierLabel(tier.height)}梯队，${tier.stocks.length} 只`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 rounded-r-card px-3 py-2 text-left transition-colors duration-fast ease-smooth hover:bg-raised"
      >
        <Flame className="h-3.5 w-3.5 shrink-0" style={{ color: labelColor }} strokeWidth={1.75} aria-hidden />
        <span className="num text-sm font-semibold" style={{ color: labelColor }}>
          {tierLabel(tier.height)}
        </span>
        <span className="num text-xs text-ink-3">{tier.stocks.length} 只</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform duration-fast ease-smooth",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={contentId}
          className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2 px-3 pb-3"
        >
          {tier.stocks.map((stock) => (
            <LimitUpStockCard key={stock.code} stock={stock} height={tier.height} />
          ))}
        </div>
      )}
    </section>
  );
}
