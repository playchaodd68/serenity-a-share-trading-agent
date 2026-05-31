import { fetchAShareSnapshot } from "./connectors/eastmoney.js";
import { scoreCandidate } from "./methodology.js";
import type { Candidate, ScreenRun, SourceRecord } from "./types.js";

export interface ScreenOptions {
  maxRows: number;
  topN: number;
  stocks?: Awaited<ReturnType<typeof fetchAShareSnapshot>>;
}

export async function screenCandidates(sources: SourceRecord[], options: ScreenOptions): Promise<ScreenRun> {
  const stocks = options.stocks ?? (await fetchAShareSnapshot(options.maxRows));
  const candidates: Candidate[] = stocks
    .map((stock) => scoreCandidate(stock, sources))
    .filter((candidate) => candidate.matchedThemes.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.topN);

  const generatedAt = new Date().toISOString();
  return {
    runId: `screen-${generatedAt.replace(/[:.]/g, "-")}`,
    generatedAt,
    candidates,
    totalStocksScanned: stocks.length,
    sourceCount: sources.length,
  };
}
