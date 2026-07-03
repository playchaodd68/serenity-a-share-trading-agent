import { fetchAShareSnapshot } from "./connectors/eastmoney.js";
import { scoreCandidate } from "./methodology.js";
import { buildEvidenceQueue, writeEvidenceQueue } from "./pipeline/evidence-queue.js";
import { applyBearCaseGate, type BearCaseRecord } from "./research/debate/bear-case.js";
import { annotateGraveyardRecall, buryBelowBar, isActiveRejectReason } from "./research/graveyard.js";
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
  // When set, the below-cut burial set is classified at the same spot and its
  // evidence-gap slice ("先验命中主题但材料不足"，没读过 ≠ 否决) is persisted as the
  // backfill queue artifact. Opt-in so harness/agent callers stay side-effect free;
  // the screen pipeline passes EVIDENCE_QUEUE_PATH (runs/evidence-queue.json).
  evidenceQueuePath?: string;
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
  const selected = candidates.slice(0, options.topN);
  if (options.evidenceQueuePath) {
    // Same entry bar as the graveyard's below-bar burial (cli updateGraveyard): the
    // lowest surviving score cuts the matched set, and the queue is written at the
    // burial spot so evidence-gap theses land in the backfill queue the moment they
    // are passed over instead of only surfacing as red graveyard rows.
    const cutScore = selected.length > 0 ? Math.min(...selected.map((candidate) => candidate.score)) : 0;
    // Codes already buried as an active reject (kill/downgraded/manual-reject) must not
    // re-enter the backfill queue: "读过并否决" cannot be re-framed as "材料不足".
    const activeRejects = new Set((options.graveyard ?? []).filter((entry) => isActiveRejectReason(entry.reason)).map((entry) => entry.code));
    const buried = buryBelowBar(candidates, cutScore, generatedAt).filter((entry) => !activeRejects.has(entry.code));
    await writeEvidenceQueue(buildEvidenceQueue(buried, generatedAt), options.evidenceQueuePath);
  }
  return {
    runId: `screen-${generatedAt.replace(/[:.]/g, "-")}`,
    generatedAt,
    candidates: selected,
    totalStocksScanned: stocks.length,
    sourceCount: sources.length,
    // Computed over the full matched set (pre-topN) so the downgrade slot reflects
    // the whole scanned theme universe, not just the survivors.
    hotThemeDowngrades: computeHotThemeDowngrades(candidates),
  };
}
