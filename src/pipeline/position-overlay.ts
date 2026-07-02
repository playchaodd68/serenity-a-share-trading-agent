import type { Portfolio } from "../portfolio/portfolio.js";
import { evaluateCatalysts } from "../research/catalysts.js";
import type { BearCaseRecord } from "../research/debate/bear-case.js";
import { synthesizeVerdict, type DebateRating } from "../research/debate/verdict.js";
import type { Candidate, GraveyardEntry, ScreenRun, WatchlistEntry } from "../types.js";

// Position overlay (P0-1, downstream half). Blind-channel conclusions come in as
// finished artifacts; this module only maps them onto holdings (exposure, concentration,
// conflicts). It has NO write path back into scoring, screening, or the watchlist —
// conclusions cannot be altered here, only compared against positions.

export interface PositionOverlayEntry {
  code: string;
  name: string;
  weight?: number;
  inLatestRun: boolean;
  candidateScore?: number;
  candidateConfidence?: Candidate["confidence"];
  watchlistStatus?: WatchlistEntry["status"];
  buried: boolean;
  bearCaseStatus: "completed" | "missing" | "failed";
  debateRating?: DebateRating;
  overdueKillCriteria: number;
  overdueCatalysts: number;
  conflicts: string[];
}

export interface PositionOverlayReport {
  generatedAt: string;
  positionCount: number;
  coveredByResearch: number;
  entries: PositionOverlayEntry[];
  concentration: Array<{ industry: string; weight: number; codes: string[] }>;
  conflictCount: number;
  disclaimer: string;
}

export const OVERLAY_DISCLAIMER =
  "本 overlay 只把盲评通道的结论映射到持仓（暴露/集中/冲突），不修改任何结论；持仓不构成证据，也不会回流进评分或筛选。不构成投资建议。";

export interface PositionOverlayInputs {
  portfolio: Portfolio;
  latestRun: ScreenRun | null;
  watchlist: WatchlistEntry[];
  bearCases: Record<string, BearCaseRecord>;
  graveyard: GraveyardEntry[];
  now?: string;
}

function overdueKillCriteriaCount(entry: WatchlistEntry | undefined, now: string): number {
  if (!entry?.killCriteria) return 0;
  return entry.killCriteria.filter((criterion) => criterion.dueDate <= now).length;
}

export function buildPositionOverlay(inputs: PositionOverlayInputs): PositionOverlayReport {
  const now = inputs.now ?? new Date().toISOString();
  const candidateByCode = new Map((inputs.latestRun?.candidates ?? []).map((candidate) => [candidate.stock.code, candidate]));
  const watchlistByCode = new Map(inputs.watchlist.map((entry) => [entry.code, entry]));
  const buriedCodes = new Set(inputs.graveyard.map((entry) => entry.code));

  const entries: PositionOverlayEntry[] = inputs.portfolio.positions.map((position) => {
    const candidate = candidateByCode.get(position.code);
    const watchlistEntry = watchlistByCode.get(position.code);
    const bearRecord = inputs.bearCases[position.code];
    const bearCaseStatus: PositionOverlayEntry["bearCaseStatus"] =
      bearRecord == null ? "missing" : bearRecord.status === "completed" ? "completed" : "failed";
    const debateRating =
      candidate != null ? synthesizeVerdict(candidate, bearRecord?.report ?? null).rating : undefined;
    const overdue = overdueKillCriteriaCount(watchlistEntry, now);
    const overdueCatalysts = watchlistEntry?.catalysts ? evaluateCatalysts(watchlistEntry.catalysts, new Set(), now).due.length : 0;

    const conflicts: string[] = [];
    if (debateRating === "reduce" || debateRating === "kill") {
      conflicts.push(`盲评辩论裁决为 ${debateRating}，与持有该仓位冲突——先看反方论据，不要先看持仓盈亏。`);
    }
    if (watchlistEntry?.status === "downgraded") {
      conflicts.push("该持仓已被盲评通道降级（downgraded）。");
    }
    if (buriedCodes.has(position.code)) {
      conflicts.push("该持仓存在墓地记录：同一论点此前已被证伪或降级过，检查当初的 kill 原因是否复现。");
    }
    if (overdue > 0) {
      conflicts.push(`有 ${overdue} 条 kill criteria 已到期未核验。`);
    }
    if (overdueCatalysts > 0) {
      conflicts.push(`有 ${overdueCatalysts} 条催化剂已到期未兑现/未确认——到期未兑现应下调后验，不是继续等待。`);
    }
    if (bearCaseStatus !== "completed" && candidate != null) {
      conflicts.push("该持仓尚无完成的反方研究员 pass：先跑 npm run research:bear。");
    }

    return {
      code: position.code,
      name: position.name ?? candidate?.stock.name ?? watchlistEntry?.name ?? position.code,
      weight: position.weight,
      inLatestRun: candidate != null,
      candidateScore: candidate?.score,
      candidateConfidence: candidate?.confidence,
      watchlistStatus: watchlistEntry?.status,
      buried: buriedCodes.has(position.code),
      bearCaseStatus,
      debateRating,
      overdueKillCriteria: overdue,
      overdueCatalysts,
      conflicts,
    };
  });

  const industryWeights = new Map<string, { weight: number; codes: string[] }>();
  for (const position of inputs.portfolio.positions) {
    const candidate = candidateByCode.get(position.code);
    const industry = candidate?.stock.industry ?? "未覆盖/未知行业";
    const current = industryWeights.get(industry) ?? { weight: 0, codes: [] };
    industryWeights.set(industry, {
      weight: current.weight + (position.weight ?? 0),
      codes: [...current.codes, position.code],
    });
  }
  const concentration = [...industryWeights.entries()]
    .map(([industry, value]) => ({ industry, weight: Number(value.weight.toFixed(4)), codes: value.codes }))
    .sort((a, b) => b.weight - a.weight);

  return {
    generatedAt: now,
    positionCount: inputs.portfolio.positions.length,
    coveredByResearch: entries.filter((entry) => entry.inLatestRun || entry.watchlistStatus != null).length,
    entries,
    concentration,
    conflictCount: entries.reduce((sum, entry) => sum + entry.conflicts.length, 0),
    disclaimer: OVERLAY_DISCLAIMER,
  };
}

export function renderPositionOverlay(report: PositionOverlayReport): string {
  const lines = [
    "# 持仓 overlay（只读映射，不修改结论）",
    `- 生成时间：${report.generatedAt}`,
    `- 持仓数：${report.positionCount}；研究覆盖：${report.coveredByResearch}；冲突提示：${report.conflictCount}`,
    "",
    "## 持仓 × 盲评结论",
    ...report.entries.map((entry) => {
      const header = `- ${entry.code} ${entry.name}${entry.weight != null ? `（权重 ${(entry.weight * 100).toFixed(1)}%）` : ""}：` +
        `${entry.inLatestRun ? `候选分 ${entry.candidateScore?.toFixed(1)}/${entry.candidateConfidence}` : "不在最新筛选中"}` +
        `${entry.watchlistStatus ? `，watchlist=${entry.watchlistStatus}` : ""}` +
        `，bear=${entry.bearCaseStatus}${entry.debateRating ? `，裁决=${entry.debateRating}` : ""}`;
      const conflictLines = entry.conflicts.map((conflict) => `  - ⚠ ${conflict}`);
      return [header, ...conflictLines].join("\n");
    }),
    "",
    "## 行业集中度",
    ...report.concentration.map((row) => `- ${row.industry}: ${(row.weight * 100).toFixed(1)}%（${row.codes.join("、")}）`),
    "",
    `> ${report.disclaimer}`,
  ];
  return lines.join("\n");
}
