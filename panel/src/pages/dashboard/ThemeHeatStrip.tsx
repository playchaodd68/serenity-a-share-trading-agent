// ThemeHeatStrip — 热门主题降权条（蓝图 §2.1）：hotThemeDowngrades[] 的方法论展示位。
// 「强制降权热门方向」：热度越高越要求证据，downgraded 用 warning 警示色标注，
// 不借用 bull 红色的"强势"暗示（色彩语义铁律）。
import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/cn";
import { fmtNum } from "@/lib/format";
import type { OverviewResponse } from "@/lib/types";

interface ThemeHeatStripProps {
  latestRun: OverviewResponse["latestRun"];
}

export function ThemeHeatStrip({ latestRun }: ThemeHeatStripProps) {
  const themes = latestRun?.hotThemeDowngrades ?? [];
  const downgradedCount = themes.filter((t) => t.downgraded).length;
  const maxHeat = Math.max(...themes.map((t) => t.heatScore), 1);

  return (
    <section aria-label="热门主题降权">
      <SectionTitle
        icon={Flame}
        title="热门主题降权"
        hint={latestRun ? `已降权 ${downgradedCount}/${themes.length}` : undefined}
      />
      {!latestRun ? (
        <p className="rounded-card border border-dashed border-line px-4 py-5 text-center text-xs text-ink-3">
          尚无筛选批次 — 运行 <span className="num">npm run screen</span> 后展示热门方向的强制降权判定。
        </p>
      ) : themes.length === 0 ? (
        <p className="rounded-card border border-dashed border-line px-4 py-5 text-center text-xs text-ink-3">
          本批次未触发热门主题降权。
        </p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {themes.map((theme) => (
            <li
              key={theme.themeId}
              title={theme.reason}
              className={cn(
                "min-w-[11rem] shrink-0 rounded-card border bg-surface px-3 py-2.5 transition-colors duration-fast ease-smooth",
                theme.downgraded
                  ? "border-warning/40 hover:border-warning/70"
                  : "border-line hover:border-line-strong",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-ink">{theme.label}</span>
                {theme.downgraded ? (
                  <Badge variant="warning">已降权</Badge>
                ) : theme.hasStrongEvidence ? (
                  <Badge variant="outline">证据充分</Badge>
                ) : (
                  <Badge variant="muted">观察</Badge>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-pill bg-raised" aria-hidden>
                  <div
                    className={cn("h-full rounded-pill", theme.downgraded ? "bg-warning" : "bg-line-strong")}
                    style={{ width: `${Math.max(6, (theme.heatScore / maxHeat) * 100)}%` }}
                  />
                </div>
                <span className="num text-2xs text-ink-2">热度 {fmtNum(theme.heatScore, 0)}</span>
              </div>
              <div className="num mt-1.5 text-2xs text-ink-3">
                候选 {theme.candidateCount} · 均换手 {fmtNum(theme.avgTurnover, 1)}%
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
