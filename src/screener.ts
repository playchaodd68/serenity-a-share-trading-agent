import { fetchAShareSnapshot } from "./connectors/eastmoney.js";
import { scoreCandidate } from "./methodology.js";
import { applySerenityQuantOverlay } from "./quant/scoring.js";
import { applyBearCaseGate } from "./research/debate/bear-case.js";
import { computeHotThemeDowngrades } from "./research/theme-heat.js";
import type { Candidate, ScreenRun, SourceRecord } from "./types.js";

export interface ScreenOptions {
  maxRows: number;
  topN: number;
  stocks?: Awaited<ReturnType<typeof fetchAShareSnapshot>>;
  // Codes with a completed adversarial bear-case pass. High confidence is only
  // reachable for candidates in this set; callers omit it to enforce the gate on all.
  bearCases?: Set<string>;
  // Receives every matched candidate (before the topN cut) so callers can record
  // passed-over theses; not persisted on the ScreenRun.
  onMatched?: (matched: Candidate[]) => void;
}

export async function screenCandidates(sources: SourceRecord[], options: ScreenOptions): Promise<ScreenRun> {
  const stocks = options.stocks ?? (await fetchAShareSnapshot(options.maxRows));
  const bearCases = options.bearCases ?? new Set<string>();
  const candidates: Candidate[] = stocks
    .map((stock) => applyBearCaseGate(scoreCandidate(stock, sources), bearCases))
    .filter((candidate) => candidate.matchedThemes.length > 0)
    .sort((a, b) => b.score - a.score);

  const generatedAt = new Date().toISOString();
  const quant = applySerenityQuantOverlay(candidates, generatedAt);
  options.onMatched?.(quant.candidates);
  return {
    runId: `screen-${generatedAt.replace(/[:.]/g, "-")}`,
    generatedAt,
    candidates: quant.candidates.slice(0, options.topN),
    totalStocksScanned: stocks.length,
    sourceCount: sources.length,
    quantSummary: quant.summary,
    // Computed over the full matched set (pre-topN) so the downgrade slot reflects
    // the whole scanned theme universe, not just the survivors.
    hotThemeDowngrades: computeHotThemeDowngrades(quant.candidates),
  };
}
