import { fetchAShareSnapshot } from "./connectors/eastmoney.js";
import { scoreCandidate } from "./methodology.js";
import { applySerenityQuantOverlay } from "./quant/scoring.js";
import type { Candidate, ScreenRun, SourceRecord } from "./types.js";

export interface ScreenOptions {
  maxRows: number;
  topN: number;
  stocks?: Awaited<ReturnType<typeof fetchAShareSnapshot>>;
  // Receives every matched candidate (before the topN cut) so callers can record
  // passed-over theses; not persisted on the ScreenRun.
  onMatched?: (matched: Candidate[]) => void;
}

export async function screenCandidates(sources: SourceRecord[], options: ScreenOptions): Promise<ScreenRun> {
  const stocks = options.stocks ?? (await fetchAShareSnapshot(options.maxRows));
  const candidates: Candidate[] = stocks
    .map((stock) => scoreCandidate(stock, sources))
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
  };
}
