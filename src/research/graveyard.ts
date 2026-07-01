import path from "node:path";
import type { Candidate, CandidateResolution, GraveyardEntry, GraveyardSummary, KillCriterion, WatchlistEntry } from "../types.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";

export const GRAVEYARD_PATH = path.resolve("data/graveyard.json");

// The graveyard records passed-over, downgraded, and killed candidates so hit-rate and
// base rates are computed over survivors + losers, not survivors only. Without it, any
// track record is inflated by survivorship bias (METHODOLOGY_NOTE 第100行).

function themesOf(candidate: Candidate): string[] {
  return candidate.matchedThemes.map((theme) => theme.label);
}

export function buryBelowBar(candidates: Candidate[], entryBar: number, now: string): GraveyardEntry[] {
  return candidates
    .filter((candidate) => candidate.score < entryBar)
    .map((candidate) => ({
      code: candidate.stock.code,
      name: candidate.stock.name,
      reason: "below-entry-bar" as const,
      score: candidate.score,
      confidence: candidate.confidence,
      matchedThemes: themesOf(candidate),
      killedCriterionIds: [],
      detail: `Passed over below entry bar ${entryBar} at score ${candidate.score.toFixed(1)}.`,
      buriedAt: now,
    }));
}

export function buryKilled(candidate: Candidate, fired: KillCriterion[], now: string): GraveyardEntry {
  return {
    code: candidate.stock.code,
    name: candidate.stock.name,
    reason: "kill-triggered",
    score: candidate.score,
    confidence: candidate.confidence,
    matchedThemes: themesOf(candidate),
    killedCriterionIds: fired.map((criterion) => criterion.id),
    detail: `Kill triggered: ${fired.map((criterion) => criterion.trigger).join(" ")}`.slice(0, 400),
    buriedAt: now,
  };
}

export function buryDowngraded(entry: WatchlistEntry, now: string): GraveyardEntry {
  return {
    code: entry.code,
    name: entry.name,
    reason: "downgraded",
    score: entry.score,
    confidence: entry.confidence,
    matchedThemes: [],
    killedCriterionIds: [],
    detail: `Downgraded out of the active set at score ${entry.score.toFixed(1)} (status ${entry.status}).`,
    buriedAt: now,
  };
}

export function mergeGraveyard(existing: GraveyardEntry[], additions: GraveyardEntry[]): GraveyardEntry[] {
  const byCode = new Map(existing.map((entry) => [entry.code, entry]));
  for (const addition of additions) {
    const current = byCode.get(addition.code);
    if (!current) {
      byCode.set(addition.code, addition);
      continue;
    }
    byCode.set(addition.code, {
      ...current,
      ...addition,
      buriedAt: current.buriedAt < addition.buriedAt ? current.buriedAt : addition.buriedAt,
      // Preserve theme attribution: buryDowngraded has no theme data (WatchlistEntry
      // carries none) and would otherwise overwrite a killed/below-bar entry's themes.
      matchedThemes: addition.matchedThemes.length > 0 ? addition.matchedThemes : current.matchedThemes,
      killedCriterionIds: [...new Set([...current.killedCriterionIds, ...addition.killedCriterionIds])],
      realizedAlpha: addition.realizedAlpha ?? current.realizedAlpha,
      outcomeLabel: addition.outcomeLabel ?? current.outcomeLabel,
    });
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export function attachGraveyardOutcomes(graveyard: GraveyardEntry[], resolutions: CandidateResolution[]): GraveyardEntry[] {
  const byCode = new Map(resolutions.map((resolution) => [resolution.code, resolution]));
  return graveyard.map((entry) => {
    const resolution = byCode.get(entry.code);
    if (!resolution) return entry;
    return { ...entry, realizedAlpha: resolution.realizedAlpha, outcomeLabel: resolution.outcomeLabel };
  });
}

function decidedOutcomes(labels: Array<GraveyardEntry["outcomeLabel"]>): number[] {
  return labels
    .filter((label): label is "validated" | "falsified" => label === "validated" || label === "falsified")
    .map((label) => (label === "validated" ? 1 : 0));
}

export function summarizeGraveyard(graveyard: GraveyardEntry[]): GraveyardSummary {
  const byReason = graveyard.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
    return counts;
  }, {});
  const themeCounts = new Map<string, number>();
  for (const entry of graveyard) {
    for (const theme of entry.matchedThemes) themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }
  const decided = decidedOutcomes(graveyard.map((entry) => entry.outcomeLabel));
  return {
    total: graveyard.length,
    byReason,
    byTheme: [...themeCounts.entries()]
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme)),
    resolvedWithOutcome: decided.length,
    buriedHitRate: decided.length === 0 ? null : decided.reduce((sum, value) => sum + value, 0) / decided.length,
  };
}

export interface CombinedBaseRate {
  n: number;
  hitRate: number | null;
  survivorsOnlyHitRate: number | null;
}

export function combinedBaseRate(resolutions: CandidateResolution[], graveyard: GraveyardEntry[]): CombinedBaseRate {
  const survivorOutcomes = resolutions.map((resolution) => resolution.outcome);
  const buriedOutcomes = decidedOutcomes(graveyard.map((entry) => entry.outcomeLabel));
  const all = [...survivorOutcomes, ...buriedOutcomes];
  const rate = (values: number[]): number | null => (values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length);
  return {
    n: all.length,
    hitRate: rate(all),
    survivorsOnlyHitRate: rate(survivorOutcomes),
  };
}

export function renderGraveyardSummary(summary: GraveyardSummary): string {
  return [
    `Graveyard: total=${summary.total}, resolved=${summary.resolvedWithOutcome}, buriedHitRate=${summary.buriedHitRate == null ? "n/a" : summary.buriedHitRate.toFixed(2)}`,
    `By reason: ${Object.entries(summary.byReason)
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ") || "none"}`,
    ...summary.byTheme.slice(0, 5).map((item) => `Theme ${item.theme}: ${item.count}`),
  ].join("\n");
}

export async function loadGraveyard(filePath = GRAVEYARD_PATH): Promise<GraveyardEntry[]> {
  return readJsonFile<GraveyardEntry[]>(filePath, []);
}

export async function saveGraveyard(graveyard: GraveyardEntry[], filePath = GRAVEYARD_PATH): Promise<void> {
  await writeJsonFile(filePath, graveyard);
}
