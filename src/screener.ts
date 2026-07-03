import path from "node:path";
import { fetchAShareSnapshot } from "./connectors/eastmoney.js";
import { scoreCandidate } from "./methodology.js";
import { buildEvidenceQueue, writeEvidenceQueue } from "./pipeline/evidence-queue.js";
import { applyBearCaseGate, type BearCaseRecord } from "./research/debate/bear-case.js";
import { annotateGraveyardRecall, buryBelowBar, isActiveRejectReason } from "./research/graveyard.js";
import { computeHotThemeDowngrades } from "./research/theme-heat.js";
import type { AShareStock, Candidate, EvidenceMissingHighPriorEntry, GraveyardEntry, ScreenRun, SourceRecord } from "./types.js";
import { writeJsonFile } from "./utils/fs.js";

// 未匹配快照审计落盘目录（P0-7）：主题门 0 命中的股票按日聚合统计，让假阴性可度量。
export const UNMATCHED_AUDIT_DIR = path.resolve("runs/unmatched-audit");
// 「高先验·证据缺失」独立区块的固定条数（P0-1，取当日 missing 组 priorScore 前列）。
export const HIGH_PRIOR_EVIDENCE_MISSING_LIMIT = 20;
export const UNMATCHED_AUDIT_INDUSTRY_LIMIT = 20;
export const UNMATCHED_AUDIT_SAMPLE_LIMIT = 50;

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
  // 未匹配快照审计（P0-7）：提供目录时按日落盘 <YYYY-MM-DD>.json 聚合统计（总数/未命中数/
  // 行业 Top20/前 50 样本码，不存全名单防膨胀）。Opt-in，与 evidenceQueuePath 同一挂法；
  // cli 的 runScreenPipeline 传入 UNMATCHED_AUDIT_DIR。
  unmatchedAuditDir?: string;
}

// 主题门 0 命中的按日聚合快照（P0-7）。只存统计与样本码，为 P1 匹配器改造提供假阴性基线。
export interface UnmatchedAuditSnapshot {
  date: string;
  total: number;
  unmatchedCount: number;
  byIndustryTop20: Array<{ industry: string; count: number }>;
  sampledCodes: string[];
}

export function buildUnmatchedAudit(unmatched: AShareStock[], totalScanned: number, date: string): UnmatchedAuditSnapshot {
  const industryCounts = new Map<string, number>();
  for (const stock of unmatched) {
    const industry = stock.industry || "(未知)";
    industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1);
  }
  return {
    date,
    total: totalScanned,
    unmatchedCount: unmatched.length,
    byIndustryTop20: [...industryCounts.entries()]
      .map(([industry, count]) => ({ industry, count }))
      .sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry))
      .slice(0, UNMATCHED_AUDIT_INDUSTRY_LIMIT),
    sampledCodes: unmatched.slice(0, UNMATCHED_AUDIT_SAMPLE_LIMIT).map((stock) => stock.code),
  };
}

export async function writeUnmatchedAudit(snapshot: UnmatchedAuditSnapshot, dir: string): Promise<void> {
  await writeJsonFile(path.join(dir, `${snapshot.date}.json`), snapshot);
}

// 「高先验·证据缺失」独立区块（P0-1）：missing 组按 priorScore（industryLogic 先验分）取前列。
// 已有主动否决（读过并否决）墓地记录的标的不得进区块——否决不能被洗白成"待补材料"。
function buildEvidenceMissingHighPrior(missing: Candidate[], activeRejects: ReadonlySet<string>): EvidenceMissingHighPriorEntry[] {
  return missing
    .filter((candidate) => !activeRejects.has(candidate.stock.code))
    .sort((a, b) => b.trace.priorScore - a.trace.priorScore || a.stock.code.localeCompare(b.stock.code))
    .slice(0, HIGH_PRIOR_EVIDENCE_MISSING_LIMIT)
    .map((candidate) => ({
      code: candidate.stock.code,
      name: candidate.stock.name,
      industry: candidate.stock.industry,
      priorScore: candidate.trace.priorScore,
      score: candidate.score,
      confidence: candidate.confidence,
      matchedThemes: candidate.matchedThemes.map((theme) => theme.label),
    }));
}

export async function screenCandidates(sources: SourceRecord[], options: ScreenOptions): Promise<ScreenRun> {
  const stocks = options.stocks ?? (await fetchAShareSnapshot(options.maxRows));
  const bearCases = options.bearCases ?? {};
  const scoredAll: Candidate[] = stocks.map((stock) => applyBearCaseGate(scoreCandidate(stock, sources), bearCases));
  const scored = scoredAll.filter((candidate) => candidate.matchedThemes.length > 0).sort((a, b) => b.score - a.score);
  const candidates = annotateGraveyardRecall(scored, options.graveyard ?? []);

  const generatedAt = new Date().toISOString();
  // Quant overlay removed by user decision (2026-07-02): uncalibrated composite
  // scores/buckets interfered with judgment. Ranking is the methodology evidence
  // score only; discipline loops (graveyard/calibration/bear gate) stay intact.
  options.onMatched?.(candidates);
  // 证据三态分层（P0-1）：topN 席位只在 evidenceStatus=covered 的候选中产生——"没读过"
  // （missing）不与"读过"同场竞价，也不沉底：进「高先验·证据缺失」独立区块与证据补齐
  // 队列（证据缺失 ≠ 否决，不给买入语义）。covered 席位空缺时宁缺毋滥，不用 missing 补位。
  const covered = candidates.filter((candidate) => candidate.trace.evidenceStatus !== "missing");
  const missing = candidates.filter((candidate) => candidate.trace.evidenceStatus === "missing");
  const selected = covered.slice(0, options.topN);
  // Codes already buried as an active reject (kill/downgraded/manual-reject) must not
  // re-enter the backfill queue or the missing block: "读过并否决" cannot be re-framed
  // as "材料不足".
  const activeRejects = new Set((options.graveyard ?? []).filter((entry) => isActiveRejectReason(entry.reason)).map((entry) => entry.code));
  if (options.evidenceQueuePath) {
    // 当日席位线 = 幸存席位的最低分（随日漂移，非质量线）。埋葬点与 cli updateGraveyard
    // 一致，evidence-gap 论点在被 pass 掉的当下就进补齐队列（missing 候选无论分数一律
    // 归档，见 buryBelowBar），而不是只出现为墓地灰色行。
    const cutScore = selected.length > 0 ? Math.min(...selected.map((candidate) => candidate.score)) : 0;
    const buried = buryBelowBar(candidates, cutScore, generatedAt).filter((entry) => !activeRejects.has(entry.code));
    await writeEvidenceQueue(buildEvidenceQueue(buried, generatedAt), options.evidenceQueuePath);
  }
  if (options.unmatchedAuditDir) {
    const unmatched = scoredAll.filter((candidate) => candidate.matchedThemes.length === 0).map((candidate) => candidate.stock);
    await writeUnmatchedAudit(buildUnmatchedAudit(unmatched, stocks.length, generatedAt.slice(0, 10)), options.unmatchedAuditDir);
  }
  return {
    runId: `screen-${generatedAt.replace(/[:.]/g, "-")}`,
    generatedAt,
    candidates: selected,
    totalStocksScanned: stocks.length,
    sourceCount: sources.length,
    evidenceMissingHighPrior: buildEvidenceMissingHighPrior(missing, activeRejects),
    // Computed over the full matched set (pre-topN) so the downgrade slot reflects
    // the whole scanned theme universe, not just the survivors.
    hotThemeDowngrades: computeHotThemeDowngrades(candidates),
  };
}
