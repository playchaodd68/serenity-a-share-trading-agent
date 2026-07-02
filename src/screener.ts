import { fetchAShareSnapshot } from "./connectors/eastmoney.js";
import { scoreCandidate } from "./methodology.js";
import { applyBearCaseGate, type BearCaseRecord } from "./research/debate/bear-case.js";
import { annotateGraveyardRecall } from "./research/graveyard.js";
import { computeHotThemeDowngrades } from "./research/theme-heat.js";
import type { Candidate, GraveyardEntry, ScreenRun, SourceRecord } from "./types.js";

export interface ScreenOptions {
  maxRows: number;
  topN: number;
  stocks?: Awaited<ReturnType<typeof fetchAShareSnapshot>>;
  // Bear-case records keyed by code. High confidence requires a completed pass with an
  // "intact" verdict; refuted caps at low, weakened at medium, missing/failed blocks high.
  bearCases?: Record<string, BearCaseRecord>;
  // Buried theses recalled as adversarial context on similar candidates (N2).
  graveyard?: GraveyardEntry[];
  // Receives every matched candidate (before the topN cut) so callers can record
  // passed-over theses; not persisted on the ScreenRun.
  onMatched?: (matched: Candidate[]) => void;
}

export async function screenCandidates(sources: SourceRecord[], options: ScreenOptions): Promise<ScreenRun> {
  const stocks = options.stocks ?? (await fetchAShareSnapshot(options.maxRows));
  const bearCases = options.bearCases ?? {};
  const scored: Candidate[] = stocks
    .map((stock) => applyBearCaseGate(scoreCandidate(stock, sources), bearCases))
    .filter((candidate) => candidate.matchedThemes.length > 0)
    .sort((a, b) => b.score - a.score);
  const candidates = annotateGraveyardRecall(scored, options.graveyard ?? []);

  const generatedAt = new Date().toISOString();
  // Quant overlay removed by user decision (2026-07-02): uncalibrated composite
  // scores/buckets interfered with judgment. Ranking is the methodology evidence
  // score only; discipline loops (graveyard/calibration/bear gate) stay intact.
  options.onMatched?.(candidates);
  return {
    runId: `screen-${generatedAt.replace(/[:.]/g, "-")}`,
    generatedAt,
    candidates: candidates.slice(0, options.topN),
    totalStocksScanned: stocks.length,
    sourceCount: sources.length,
    // Computed over the full matched set (pre-topN) so the downgrade slot reflects
    // the whole scanned theme universe, not just the survivors.
    hotThemeDowngrades: computeHotThemeDowngrades(candidates),
  };
}
