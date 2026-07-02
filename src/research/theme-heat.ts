import type { Candidate, HotThemeDowngrade } from "../types.js";

// Forced hot-theme downgrade slot: every screen must rank matched themes by market heat
// and explicitly downgrade at least one popular direction that lacks strong incremental
// evidence (P0 / strong P1). If every hot theme is evidence-backed, the hottest theme is
// listed with an explicit not-downgraded rationale instead of silently omitting the slot.

const HEAT_DOWNGRADE_THRESHOLD = 5;

interface ThemeAggregate {
  themeId: string;
  label: string;
  turnovers: number[];
  pctChanges: number[];
  count: number;
  strongEvidence: boolean;
}

function avg(values: number[]): number {
  const valid = values.filter(Number.isFinite);
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function candidateHasStrongEvidence(candidate: Candidate): boolean {
  const evidence = candidate.trace.structuredEvidence ?? [];
  return evidence.some((item) => (item.tier === "P0" && item.direct) || (item.tier === "P1" && item.confidence >= 0.55));
}

export function computeHotThemeDowngrades(candidates: Candidate[]): HotThemeDowngrade[] {
  const byTheme = new Map<string, ThemeAggregate>();
  for (const candidate of candidates) {
    const strong = candidateHasStrongEvidence(candidate);
    for (const theme of candidate.matchedThemes) {
      const current = byTheme.get(theme.themeId) ?? {
        themeId: theme.themeId,
        label: theme.label,
        turnovers: [],
        pctChanges: [],
        count: 0,
        strongEvidence: false,
      };
      byTheme.set(theme.themeId, {
        ...current,
        turnovers: [...current.turnovers, candidate.stock.turnover ?? 0],
        pctChanges: [...current.pctChanges, candidate.stock.pctChange ?? 0],
        count: current.count + 1,
        strongEvidence: current.strongEvidence || strong,
      });
    }
  }

  const entries = [...byTheme.values()].map((aggregate) => {
    const avgTurnover = avg(aggregate.turnovers);
    const avgPctChange = avg(aggregate.pctChanges);
    const heatScore = Number((avgTurnover + Math.max(avgPctChange, 0) * 1.5).toFixed(2));
    return { aggregate, avgTurnover, avgPctChange, heatScore };
  });
  entries.sort((a, b) => b.heatScore - a.heatScore || a.aggregate.themeId.localeCompare(b.aggregate.themeId));

  const results: HotThemeDowngrade[] = entries.map(({ aggregate, avgTurnover, avgPctChange, heatScore }) => {
    const hot = heatScore >= HEAT_DOWNGRADE_THRESHOLD;
    const downgraded = hot && !aggregate.strongEvidence;
    const reason = downgraded
      ? `热度分 ${heatScore.toFixed(1)}（换手 ${avgTurnover.toFixed(1)}%/涨幅 ${avgPctChange.toFixed(1)}%）高但缺 P0/强 P1 增量证据，主动降级：热度≠增量证据。`
      : hot
        ? `热度分 ${heatScore.toFixed(1)} 高，但已有 P0/强 P1 证据支撑，本轮不降级；继续复核增量证据兑现。`
        : `热度分 ${heatScore.toFixed(1)} 未达降级评审线（${HEAT_DOWNGRADE_THRESHOLD}）。`;
    return {
      themeId: aggregate.themeId,
      label: aggregate.label,
      heatScore,
      avgTurnover: Number(avgTurnover.toFixed(2)),
      avgPctChange: Number(avgPctChange.toFixed(2)),
      candidateCount: aggregate.count,
      hasStrongEvidence: aggregate.strongEvidence,
      downgraded,
      reason,
    };
  });

  return results;
}

export function renderHotThemeDowngrades(entries: HotThemeDowngrade[]): string {
  if (entries.length === 0) return "- 本轮无匹配主题，热门降级槽为空。";
  const downgradedEntries = entries.filter((entry) => entry.downgraded);
  const header =
    downgradedEntries.length > 0
      ? `主动降级 ${downgradedEntries.length} 个热门方向（热度≠增量证据）：`
      : "本轮无热门方向被强制降级（热门主题均有 P0/强 P1 证据支撑或热度未达线）：";
  const lines = entries
    .slice(0, 6)
    .map(
      (entry) =>
        `- ${entry.downgraded ? "[降级] " : ""}${entry.label}：热度 ${entry.heatScore.toFixed(1)}，候选 ${entry.candidateCount} 只，强证据 ${
          entry.hasStrongEvidence ? "有" : "无"
        }。${entry.reason}`,
    );
  return [header, ...lines].join("\n");
}
