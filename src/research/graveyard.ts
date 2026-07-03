import path from "node:path";
import type { Candidate, CandidateResolution, GraveyardEntry, GraveyardReason, GraveyardSummary, KillCriterion, WatchlistEntry } from "../types.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";
import { BEAR_GATE_REFUTED_REASON } from "./debate/bear-case.js";

export const GRAVEYARD_PATH = path.resolve("data/graveyard.json");

// The graveyard records passed-over, downgraded, and killed candidates so hit-rate and
// base rates are computed over survivors + losers, not survivors only. Without it, any
// track record is inflated by survivorship bias (METHODOLOGY_NOTE 第100行).

function themesOf(candidate: Candidate): string[] {
  return candidate.matchedThemes.map((theme) => theme.label);
}

// Disposal-layer split for passed-over theses (2026-07-03 持仓误判复盘). A low-confidence
// candidate whose prior hit configured themes was buried because evidence coverage never
// arrived — "没读过", not "读过并否决". Scoring it below-entry-bar lets the panel render
// ignorance as a red-flag veto, which inverts methodology.ts 蒸馏规则 3（机构覆盖少是
// 先验加分项，补不齐 P0/P1 只降置信度）: scarce coverage must queue evidence backfill,
// never masquerade as a refutation. Anything with medium/high confidence had enough
// material to be judged, so passing it over stays a genuine below-entry-bar decision;
// low confidence without a theme hit never had a prior thesis to defend either way.
// But "low confidence" is not always "unread": the disqualifier hard veto (立案调查/
// 财务造假等, methodology.ts) and a bear-pass refuted verdict (applyBearCaseGate) both
// cap confidence at low after the thesis WAS read and rejected. Those must never be
// laundered into evidence-gap (and its backfill queue) — the classifier reads the
// deterministic veto fields already on the trace, no inference.
export function activeVetoReasons(candidate: Candidate): string[] {
  const reasons: string[] = [];
  const disqualifiers = candidate.trace.disqualifiers;
  if (disqualifiers?.triggered) reasons.push(`一票否决: ${disqualifiers.hitSignals.join(" / ")}`);
  if ((candidate.trace.ceilingReasons ?? []).includes(BEAR_GATE_REFUTED_REASON)) reasons.push(BEAR_GATE_REFUTED_REASON);
  return reasons;
}

export function classifyBurialReason(
  confidence: Candidate["confidence"],
  matchedThemes: readonly string[],
  activelyVetoed = false,
): Extract<GraveyardReason, "below-entry-bar" | "evidence-gap"> {
  if (activelyVetoed) return "below-entry-bar";
  return confidence === "low" && matchedThemes.length > 0 ? "evidence-gap" : "below-entry-bar";
}

export function buryBelowBar(candidates: Candidate[], entryBar: number, now: string): GraveyardEntry[] {
  return candidates
    .filter((candidate) => candidate.score < entryBar)
    .map((candidate) => {
      const themes = themesOf(candidate);
      const vetoes = activeVetoReasons(candidate);
      const reason = classifyBurialReason(candidate.confidence, themes, vetoes.length > 0);
      const detail =
        vetoes.length > 0
          ? `Passed over below entry bar ${entryBar} at score ${candidate.score.toFixed(1)} after active veto: ${vetoes.join("；")}`.slice(0, 400)
          : reason === "evidence-gap"
            ? `Evidence gap below entry bar ${entryBar} at score ${candidate.score.toFixed(1)}: prior hit ${themes.join("/")} but coverage stayed low-confidence (unread, not refuted).`
            : `Passed over below entry bar ${entryBar} at score ${candidate.score.toFixed(1)}.`;
      return {
        code: candidate.stock.code,
        name: candidate.stock.name,
        reason,
        score: candidate.score,
        confidence: candidate.confidence,
        matchedThemes: themes,
        killedCriterionIds: [],
        detail,
        buriedAt: now,
      };
    });
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

// Reason tiers mirror the panel's rendering split (panel graveyardTiers.ts): active
// rejects (读过并否决) render red, neutral archives (evidence-gap/below-entry-bar) grey.
const ACTIVE_REJECT_REASONS: ReadonlySet<GraveyardReason> = new Set(["kill-triggered", "downgraded", "manual-reject"]);

export function isActiveRejectReason(reason: GraveyardReason): boolean {
  return ACTIVE_REJECT_REASONS.has(reason);
}

export function mergeGraveyard(existing: GraveyardEntry[], additions: GraveyardEntry[]): GraveyardEntry[] {
  const byCode = new Map(existing.map((entry) => [entry.code, entry]));
  for (const addition of additions) {
    const current = byCode.get(addition.code);
    if (!current) {
      byCode.set(addition.code, addition);
      continue;
    }
    // Reason priority: a neutral burial (a later screen passing the code over) must not
    // silently downgrade a recorded active reject into a grey archive row — red must
    // stay reserved for "读过并否决". Non-verdict fields still merge below.
    const keepVerdict = isActiveRejectReason(current.reason) && !isActiveRejectReason(addition.reason);
    byCode.set(addition.code, {
      ...current,
      ...addition,
      ...(keepVerdict ? { reason: current.reason, detail: current.detail } : {}),
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
  // Same measurement basis for both populations: deadband outcome labels with
  // inconclusive excluded — mixing sign-based outcomes (survivors) with label-based
  // outcomes (buried) would skew the combined base rate.
  // Origin isolation: graveyard-origin ledger rows verify rejections and are already
  // written back onto graveyard entries as outcomeLabel. Counting them here would both
  // pollute survivorsOnlyHitRate with rejected theses and double-count the same burial
  // outcome in the combined rate — exactly the survivorship-bias gap this report exists
  // to expose.
  const survivorOutcomes = decidedOutcomes(
    resolutions.filter((resolution) => resolution.origin !== "graveyard").map((resolution) => resolution.outcomeLabel),
  );
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

// --- Graveyard activation (N2) -------------------------------------------------------
// The graveyard stops being write-only storage: before conclusions ship, similar buried
// theses are recalled and injected as adversarial context (ported pattern: RD-Agent
// CoSTEER failed-knowledge retrieval — recall similar failures before generating).

export interface GraveyardRecall {
  entry: GraveyardEntry;
  match: "same-code" | "shared-theme";
}

export function recallSimilarBuried(candidate: Candidate, graveyard: GraveyardEntry[], limit = 3): GraveyardRecall[] {
  const themeLabels = new Set(candidate.matchedThemes.map((theme) => theme.label));
  const recalls: GraveyardRecall[] = [];
  for (const entry of graveyard) {
    if (entry.code === candidate.stock.code) {
      recalls.push({ entry, match: "same-code" });
      continue;
    }
    if (entry.matchedThemes.some((theme) => themeLabels.has(theme))) {
      recalls.push({ entry, match: "shared-theme" });
    }
  }
  recalls.sort((a, b) => {
    if (a.match !== b.match) return a.match === "same-code" ? -1 : 1;
    return b.entry.buriedAt.localeCompare(a.entry.buriedAt);
  });
  return recalls.slice(0, limit);
}

export function graveyardRecallNotes(recalls: GraveyardRecall[]): string[] {
  return recalls.map((recall) => {
    const outcome = recall.entry.outcomeLabel ? `，事后 ${recall.entry.outcomeLabel}${recall.entry.realizedAlpha != null ? `（alpha ${(recall.entry.realizedAlpha * 100).toFixed(1)}%）` : ""}` : "";
    return recall.match === "same-code"
      ? `墓地召回（同一标的）：${recall.entry.code} ${recall.entry.name} 曾于 ${recall.entry.buriedAt.slice(0, 10)} 因 ${recall.entry.reason} 入墓——${recall.entry.detail}${outcome}。核对当初死因是否已被新证据解除。`
      : `墓地召回（相似论点）：${recall.entry.name}（${recall.entry.matchedThemes.join("/")}）曾因 ${recall.entry.reason} 入墓——${recall.entry.detail}${outcome}。检查本候选是否踩同一失效模式。`;
  });
}

// Read-only annotation: appends recalled failures to trace.risks so every report and
// bear pass sees them; never touches scores or confidence.
export function annotateGraveyardRecall(candidates: Candidate[], graveyard: GraveyardEntry[]): Candidate[] {
  if (graveyard.length === 0) return candidates;
  return candidates.map((candidate) => {
    const notes = graveyardRecallNotes(recallSimilarBuried(candidate, graveyard));
    if (notes.length === 0) return candidate;
    const existing = new Set(candidate.trace.risks);
    const fresh = notes.filter((note) => !existing.has(note));
    if (fresh.length === 0) return candidate;
    return { ...candidate, trace: { ...candidate.trace, risks: [...candidate.trace.risks, ...fresh] } };
  });
}
