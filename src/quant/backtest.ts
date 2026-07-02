import type { QuantCandidateBucket, QuantEvidenceGate } from "../types.js";
import { assessBacktestOverfitting, type OverfittingGuard } from "./overfitting.js";

export const SERENITY_QUANT_BACKTEST = "Serenity Mainline Quant Backtest" as const;

const TWO_SIDED_CROWDING_BACKTEST_NOTE = "拥挤度双向计价：供给侧集中按证据加分，交易侧拥挤在缺新增强证据时降权；回测同时因产业证据、趋势破坏、风险排雷或交易不可执行而降权。";

export interface QuantBacktestCandidate {
  code: string;
  name?: string;
  industry?: string;
  theme?: string;
  score: number;
  bucket?: QuantCandidateBucket;
  evidenceGate?: QuantEvidenceGate;
  forwardReturn: number;
  benchmarkReturn?: number;
  tradable?: boolean;
  suspended?: boolean;
  limitUp?: boolean;
  limitDown?: boolean;
}

export interface QuantBacktestSnapshot {
  date: string;
  candidates: QuantBacktestCandidate[];
  benchmarkReturn?: number;
}

export interface QuantBacktestOptions {
  portfolioSize?: number;
  minScore?: number;
  includeBuckets?: QuantCandidateBucket[];
  includeEvidenceGates?: QuantEvidenceGate[];
  maxIndustryWeight?: number;
  transactionCostBps?: number;
  slippageBps?: number;
  initialEquity?: number;
  periodsPerYear?: number;
  allowLimitUpBuys?: boolean;
  allowLimitDownSells?: boolean;
  // Number of factor/parameter configurations searched, for multiple-testing correction.
  trials?: number;
}

export interface EffectiveQuantBacktestOptions {
  portfolioSize: number;
  minScore: number;
  includeBuckets: QuantCandidateBucket[];
  includeEvidenceGates: QuantEvidenceGate[];
  maxIndustryWeight: number;
  transactionCostBps: number;
  slippageBps: number;
  initialEquity: number;
  periodsPerYear: number;
  allowLimitUpBuys: boolean;
  allowLimitDownSells: boolean;
  trials: number;
}

export interface QuantBacktestSelectedPosition {
  code: string;
  name?: string;
  industry: string;
  theme?: string;
  score: number;
  bucket?: QuantCandidateBucket;
  evidenceGate?: QuantEvidenceGate;
  weight: number;
  forwardReturn: number;
  frozen: boolean;
}

export interface QuantBacktestPeriodResult {
  date: string;
  selected: QuantBacktestSelectedPosition[];
  grossReturn: number;
  netReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  turnover: number;
  tradedWeight: number;
  costDrag: number;
  cashWeight: number;
  equity: number;
  benchmarkEquity: number;
  drawdown: number;
  blockedBuys: string[];
  blockedSells: string[];
}

export interface QuantBacktestMetrics {
  periods: number;
  totalReturn: number;
  annualizedReturn: number;
  benchmarkTotalReturn: number;
  benchmarkAnnualizedReturn: number;
  excessTotalReturn: number;
  maxDrawdown: number;
  sharpe: number | null;
  calmar: number | null;
  avgTurnover: number;
  avgTradedWeight: number;
  hitRate: number;
  avgNetReturn: number;
  avgExcessReturn: number;
}

export interface QuantBacktestIc {
  date: string;
  rankIc: number | null;
  count: number;
}

export interface QuantBacktestGroupReturn {
  group: string;
  observations: number;
  averageForwardReturn: number;
  winRate: number;
}

export interface QuantBacktestBucketStat {
  bucket: QuantCandidateBucket | "unclassified";
  observations: number;
  averageForwardReturn: number;
  selectedObservations: number;
  averageSelectedWeight: number;
}

export interface QuantBacktestResult {
  strategy: typeof SERENITY_QUANT_BACKTEST;
  generatedAt: string;
  options: EffectiveQuantBacktestOptions;
  periods: QuantBacktestPeriodResult[];
  metrics: QuantBacktestMetrics;
  ic: QuantBacktestIc[];
  groupReturns: QuantBacktestGroupReturn[];
  bucketStats: QuantBacktestBucketStat[];
  overfitting?: OverfittingGuard;
  notes: string[];
}

interface FrozenPosition {
  candidate: QuantBacktestCandidate;
  previousWeight: number;
  reason: string;
}

function effectiveOptions(options: QuantBacktestOptions = {}): EffectiveQuantBacktestOptions {
  return {
    portfolioSize: Math.max(1, Math.floor(options.portfolioSize ?? 20)),
    minScore: options.minScore ?? 0,
    includeBuckets: options.includeBuckets ?? ["core", "watchlist"],
    includeEvidenceGates: options.includeEvidenceGates ?? ["pass", "watchlist"],
    maxIndustryWeight: Math.min(1, Math.max(0.01, options.maxIndustryWeight ?? 0.35)),
    transactionCostBps: Math.max(0, options.transactionCostBps ?? 15),
    slippageBps: Math.max(0, options.slippageBps ?? 10),
    initialEquity: Math.max(0.000001, options.initialEquity ?? 1),
    periodsPerYear: Math.max(1, options.periodsPerYear ?? 52),
    allowLimitUpBuys: options.allowLimitUpBuys ?? false,
    allowLimitDownSells: options.allowLimitDownSells ?? false,
    trials: Math.max(1, Math.floor(options.trials ?? 1)),
  };
}

function round(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function avg(values: number[]): number {
  const valid = values.filter(Number.isFinite);
  return valid.length > 0 ? sum(valid) / valid.length : 0;
}

function stddev(values: number[]): number {
  const valid = values.filter(Number.isFinite);
  if (valid.length < 2) return 0;
  const mean = avg(valid);
  const variance = sum(valid.map((value) => (value - mean) ** 2)) / (valid.length - 1);
  return Math.sqrt(variance);
}

function industryFor(candidate: QuantBacktestCandidate): string {
  return candidate.industry?.trim() || candidate.theme?.trim() || "未分类产业链";
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new Error(`Invalid backtest input: ${label} must be a finite number.`);
}

function normalizeSnapshots(snapshots: QuantBacktestSnapshot[]): QuantBacktestSnapshot[] {
  return snapshots
    .map((snapshot, index) => {
      if (!snapshot.date) throw new Error(`Invalid backtest input: snapshots[${index}].date is required.`);
      if (!Array.isArray(snapshot.candidates)) throw new Error(`Invalid backtest input: snapshots[${index}].candidates must be an array.`);
      for (const [candidateIndex, candidate] of snapshot.candidates.entries()) {
        if (!candidate.code) throw new Error(`Invalid backtest input: snapshots[${index}].candidates[${candidateIndex}].code is required.`);
        assertFiniteNumber(candidate.score, `snapshots[${index}].candidates[${candidateIndex}].score`);
        assertFiniteNumber(candidate.forwardReturn, `snapshots[${index}].candidates[${candidateIndex}].forwardReturn`);
        if (candidate.benchmarkReturn != null) assertFiniteNumber(candidate.benchmarkReturn, `snapshots[${index}].candidates[${candidateIndex}].benchmarkReturn`);
      }
      if (snapshot.benchmarkReturn != null) assertFiniteNumber(snapshot.benchmarkReturn, `snapshots[${index}].benchmarkReturn`);
      return {
        ...snapshot,
        candidates: [...snapshot.candidates],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function candidateByCode(snapshot: QuantBacktestSnapshot): Map<string, QuantBacktestCandidate> {
  return new Map(snapshot.candidates.map((candidate) => [candidate.code, candidate]));
}

function canEnter(candidate: QuantBacktestCandidate, previousWeights: Map<string, number>, options: EffectiveQuantBacktestOptions): boolean {
  if (candidate.tradable === false || candidate.suspended) return false;
  if (!options.allowLimitUpBuys && candidate.limitUp && !previousWeights.has(candidate.code)) return false;
  if (candidate.score < options.minScore) return false;
  if (candidate.bucket && !options.includeBuckets.includes(candidate.bucket)) return false;
  if (candidate.evidenceGate && !options.includeEvidenceGates.includes(candidate.evidenceGate)) return false;
  return true;
}

function frozenPositions(snapshot: QuantBacktestSnapshot, previousWeights: Map<string, number>, options: EffectiveQuantBacktestOptions): FrozenPosition[] {
  const byCode = candidateByCode(snapshot);
  const frozen: FrozenPosition[] = [];
  for (const [code, previousWeight] of previousWeights.entries()) {
    if (previousWeight <= 0) continue;
    const candidate = byCode.get(code);
    if (!candidate) continue;
    if (!options.allowLimitDownSells && candidate.limitDown) {
      frozen.push({ candidate, previousWeight, reason: `${code} 跌停，无法按计划卖出` });
    } else if (candidate.tradable === false || candidate.suspended) {
      frozen.push({ candidate, previousWeight, reason: `${code} 停牌或不可交易，沿用上一期权重` });
    }
  }
  return frozen;
}

function maxIndustryCount(options: EffectiveQuantBacktestOptions): number {
  if (options.maxIndustryWeight >= 1) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(options.portfolioSize * options.maxIndustryWeight + 1e-9));
}

function sortCandidates(candidates: QuantBacktestCandidate[]): QuantBacktestCandidate[] {
  return [...candidates].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return a.code.localeCompare(b.code);
  });
}

function selectedPortfolio(snapshot: QuantBacktestSnapshot, previousWeights: Map<string, number>, options: EffectiveQuantBacktestOptions): { selected: QuantBacktestSelectedPosition[]; blockedBuys: string[]; blockedSells: string[] } {
  const frozen = frozenPositions(snapshot, previousWeights, options);
  const frozenCodes = new Set(frozen.map((item) => item.candidate.code));
  const industryCounts = new Map<string, number>();
  const industryLimit = maxIndustryCount(options);

  for (const item of frozen) {
    const industry = industryFor(item.candidate);
    industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1);
  }

  const desiredSlots = Math.max(0, options.portfolioSize - frozen.length);
  const desired: QuantBacktestCandidate[] = [];
  const blockedBuys: string[] = [];

  for (const candidate of sortCandidates(snapshot.candidates)) {
    if (frozenCodes.has(candidate.code)) continue;
    const wasHeld = previousWeights.has(candidate.code);
    if (!options.allowLimitUpBuys && candidate.limitUp && !wasHeld) {
      blockedBuys.push(`${candidate.code} 涨停，跳过新买入`);
      continue;
    }
    if (!canEnter(candidate, previousWeights, options)) continue;
    const industry = industryFor(candidate);
    const currentIndustryCount = industryCounts.get(industry) ?? 0;
    if (currentIndustryCount >= industryLimit) continue;
    desired.push(candidate);
    industryCounts.set(industry, currentIndustryCount + 1);
    if (desired.length >= desiredSlots) break;
  }

  const frozenWeight = Math.min(1, sum(frozen.map((item) => item.previousWeight)));
  const desiredWeight = desired.length > 0 ? Math.max(0, 1 - frozenWeight) / desired.length : 0;
  const selected = [
    ...frozen.map((item) => ({
      code: item.candidate.code,
      name: item.candidate.name,
      industry: industryFor(item.candidate),
      theme: item.candidate.theme,
      score: item.candidate.score,
      bucket: item.candidate.bucket,
      evidenceGate: item.candidate.evidenceGate,
      weight: round(item.previousWeight),
      forwardReturn: item.candidate.forwardReturn,
      frozen: true,
    })),
    ...desired.map((candidate) => ({
      code: candidate.code,
      name: candidate.name,
      industry: industryFor(candidate),
      theme: candidate.theme,
      score: candidate.score,
      bucket: candidate.bucket,
      evidenceGate: candidate.evidenceGate,
      weight: round(desiredWeight),
      forwardReturn: candidate.forwardReturn,
      frozen: false,
    })),
  ];

  return {
    selected,
    blockedBuys,
    blockedSells: frozen.map((item) => item.reason),
  };
}

function weightsFromSelected(selected: QuantBacktestSelectedPosition[]): Map<string, number> {
  return new Map(selected.map((position) => [position.code, position.weight]));
}

function turnoverStats(previousWeights: Map<string, number>, nextWeights: Map<string, number>): { turnover: number; tradedWeight: number } {
  const codes = new Set([...previousWeights.keys(), ...nextWeights.keys()]);
  const grossDiff = sum([...codes].map((code) => Math.abs((nextWeights.get(code) ?? 0) - (previousWeights.get(code) ?? 0))));
  const previousInvested = sum([...previousWeights.values()]) > 0;
  if (!previousInvested) {
    const initialBuy = sum([...nextWeights.values()]);
    return { turnover: round(initialBuy), tradedWeight: round(initialBuy) };
  }
  return {
    turnover: round(grossDiff / 2),
    tradedWeight: round(grossDiff),
  };
}

function benchmarkReturnFor(snapshot: QuantBacktestSnapshot): number {
  if (snapshot.benchmarkReturn != null) return snapshot.benchmarkReturn;
  const candidateBenchmarks = snapshot.candidates.map((candidate) => candidate.benchmarkReturn).filter((value): value is number => value != null && Number.isFinite(value));
  return avg(candidateBenchmarks);
}

function rank(values: number[]): number[] {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  let cursor = 0;
  while (cursor < sorted.length) {
    let end = cursor + 1;
    while (end < sorted.length && sorted[end].value === sorted[cursor].value) end += 1;
    const averageRank = (cursor + 1 + end) / 2;
    for (let index = cursor; index < end; index += 1) {
      ranks[sorted[index].index] = averageRank;
    }
    cursor = end;
  }
  return ranks;
}

function correlation(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 3) return null;
  const leftStd = stddev(left);
  const rightStd = stddev(right);
  if (leftStd === 0 || rightStd === 0) return null;
  const leftMean = avg(left);
  const rightMean = avg(right);
  const covariance = sum(left.map((value, index) => (value - leftMean) * (right[index] - rightMean))) / (left.length - 1);
  return covariance / (leftStd * rightStd);
}

function rankIcFor(snapshot: QuantBacktestSnapshot): QuantBacktestIc {
  const valid = snapshot.candidates.filter((candidate) => Number.isFinite(candidate.score) && Number.isFinite(candidate.forwardReturn));
  const rankIc = correlation(rank(valid.map((candidate) => candidate.score)), rank(valid.map((candidate) => candidate.forwardReturn)));
  return {
    date: snapshot.date,
    rankIc: rankIc == null ? null : round(rankIc, 4),
    count: valid.length,
  };
}

function groupReturnsFor(snapshots: QuantBacktestSnapshot[]): QuantBacktestGroupReturn[] {
  const groups = new Map<string, number[]>();
  const groupCount = 5;
  for (const snapshot of snapshots) {
    const sorted = sortCandidates(snapshot.candidates.filter((candidate) => Number.isFinite(candidate.forwardReturn)));
    if (sorted.length === 0) continue;
    for (const [index, candidate] of sorted.entries()) {
      const groupIndex = Math.min(groupCount - 1, Math.floor((index * groupCount) / sorted.length));
      const label = `Q${groupIndex + 1}${groupIndex === 0 ? "-high" : groupIndex === groupCount - 1 ? "-low" : ""}`;
      groups.set(label, [...(groups.get(label) ?? []), candidate.forwardReturn]);
    }
  }
  return [...groups.entries()]
    .map(([group, returns]) => ({
      group,
      observations: returns.length,
      averageForwardReturn: round(avg(returns)),
      winRate: round(returns.filter((value) => value > 0).length / Math.max(returns.length, 1)),
    }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

function bucketStatsFor(snapshots: QuantBacktestSnapshot[], periods: QuantBacktestPeriodResult[]): QuantBacktestBucketStat[] {
  const allReturns = new Map<QuantCandidateBucket | "unclassified", number[]>();
  const selectedWeights = new Map<QuantCandidateBucket | "unclassified", number[]>();

  for (const snapshot of snapshots) {
    for (const candidate of snapshot.candidates) {
      const bucket = candidate.bucket ?? "unclassified";
      allReturns.set(bucket, [...(allReturns.get(bucket) ?? []), candidate.forwardReturn]);
    }
  }

  for (const period of periods) {
    for (const position of period.selected) {
      const bucket = position.bucket ?? "unclassified";
      selectedWeights.set(bucket, [...(selectedWeights.get(bucket) ?? []), position.weight]);
    }
  }

  const buckets = new Set<QuantCandidateBucket | "unclassified">([...allReturns.keys(), ...selectedWeights.keys()]);
  return [...buckets]
    .map((bucket) => {
      const returns = allReturns.get(bucket) ?? [];
      const weights = selectedWeights.get(bucket) ?? [];
      return {
        bucket,
        observations: returns.length,
        averageForwardReturn: round(avg(returns)),
        selectedObservations: weights.length,
        averageSelectedWeight: round(avg(weights)),
      };
    })
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function annualizedReturn(totalReturn: number, periods: number, periodsPerYear: number): number {
  if (periods <= 0) return 0;
  if (totalReturn <= -1) return -1;
  return (1 + totalReturn) ** (periodsPerYear / periods) - 1;
}

function metricsFor(periods: QuantBacktestPeriodResult[], options: EffectiveQuantBacktestOptions): QuantBacktestMetrics {
  if (periods.length === 0) {
    return {
      periods: 0,
      totalReturn: 0,
      annualizedReturn: 0,
      benchmarkTotalReturn: 0,
      benchmarkAnnualizedReturn: 0,
      excessTotalReturn: 0,
      maxDrawdown: 0,
      sharpe: null,
      calmar: null,
      avgTurnover: 0,
      avgTradedWeight: 0,
      hitRate: 0,
      avgNetReturn: 0,
      avgExcessReturn: 0,
    };
  }

  const finalPeriod = periods[periods.length - 1];
  const totalReturn = finalPeriod.equity / options.initialEquity - 1;
  const benchmarkTotalReturn = finalPeriod.benchmarkEquity - 1;
  const annReturn = annualizedReturn(totalReturn, periods.length, options.periodsPerYear);
  const benchmarkAnnReturn = annualizedReturn(benchmarkTotalReturn, periods.length, options.periodsPerYear);
  const netReturns = periods.map((period) => period.netReturn);
  const netStd = stddev(netReturns);
  const sharpe = netStd > 0 ? (avg(netReturns) / netStd) * Math.sqrt(options.periodsPerYear) : null;
  const maxDrawdown = Math.min(...periods.map((period) => period.drawdown), 0);

  return {
    periods: periods.length,
    totalReturn: round(totalReturn),
    annualizedReturn: round(annReturn),
    benchmarkTotalReturn: round(benchmarkTotalReturn),
    benchmarkAnnualizedReturn: round(benchmarkAnnReturn),
    excessTotalReturn: round((1 + totalReturn) / Math.max(1 + benchmarkTotalReturn, 0.000001) - 1),
    maxDrawdown: round(maxDrawdown),
    sharpe: sharpe == null ? null : round(sharpe, 4),
    calmar: maxDrawdown < 0 ? round(annReturn / Math.abs(maxDrawdown), 4) : null,
    avgTurnover: round(avg(periods.map((period) => period.turnover))),
    avgTradedWeight: round(avg(periods.map((period) => period.tradedWeight))),
    hitRate: round(periods.filter((period) => period.netReturn > 0).length / periods.length),
    avgNetReturn: round(avg(netReturns)),
    avgExcessReturn: round(avg(periods.map((period) => period.excessReturn))),
  };
}

export function runQuantBacktest(inputSnapshots: QuantBacktestSnapshot[], rawOptions: QuantBacktestOptions = {}): QuantBacktestResult {
  const options = effectiveOptions(rawOptions);
  const snapshots = normalizeSnapshots(inputSnapshots);
  const periods: QuantBacktestPeriodResult[] = [];
  let previousWeights = new Map<string, number>();
  let equity = options.initialEquity;
  let benchmarkEquity = 1;
  let peakEquity = equity;
  const costRate = (options.transactionCostBps + options.slippageBps) / 10_000;

  for (const snapshot of snapshots) {
    const portfolio = selectedPortfolio(snapshot, previousWeights, options);
    const nextWeights = weightsFromSelected(portfolio.selected);
    const { turnover, tradedWeight } = turnoverStats(previousWeights, nextWeights);
    const grossReturn = sum(portfolio.selected.map((position) => position.weight * position.forwardReturn));
    const costDrag = tradedWeight * costRate;
    const netReturn = grossReturn - costDrag;
    const benchmarkReturn = benchmarkReturnFor(snapshot);
    equity *= 1 + netReturn;
    benchmarkEquity *= 1 + benchmarkReturn;
    peakEquity = Math.max(peakEquity, equity);
    const weightSum = sum(portfolio.selected.map((position) => position.weight));
    const drawdown = peakEquity > 0 ? equity / peakEquity - 1 : 0;

    periods.push({
      date: snapshot.date,
      selected: portfolio.selected,
      grossReturn: round(grossReturn),
      netReturn: round(netReturn),
      benchmarkReturn: round(benchmarkReturn),
      excessReturn: round(netReturn - benchmarkReturn),
      turnover,
      tradedWeight,
      costDrag: round(costDrag),
      cashWeight: round(Math.max(0, 1 - weightSum)),
      equity: round(equity),
      benchmarkEquity: round(benchmarkEquity),
      drawdown: round(drawdown),
      blockedBuys: portfolio.blockedBuys,
      blockedSells: portfolio.blockedSells,
    });

    previousWeights = nextWeights;
  }

  const overfitting =
    options.trials >= 2 && periods.length >= 2
      ? assessBacktestOverfitting(periods.map((period) => period.netReturn), options.trials)
      : undefined;

  return {
    strategy: SERENITY_QUANT_BACKTEST,
    generatedAt: new Date().toISOString(),
    options,
    periods,
    metrics: metricsFor(periods, options),
    ic: snapshots.map(rankIcFor),
    groupReturns: groupReturnsFor(snapshots),
    bucketStats: bucketStatsFor(snapshots, periods),
    overfitting,
    notes: [
      "输入契约：每个 snapshot 表示调仓日截面，candidate.forwardReturn 为调仓后下一持有期收益率，小数格式如 0.05。",
      "组合构建：默认等权持有 core/watchlist，行业权重用持仓数量近似约束；技术面只确认趋势和交易可执行性。",
      "交易约束：默认不能涨停新买入、不能跌停卖出，停牌/不可交易持仓沿用上一期权重。",
      ...(overfitting
        ? [
            `过拟合护栏：trials=${overfitting.numTrials}，Deflated Sharpe=${overfitting.deflatedSharpe.dsr.toFixed(3)}（阈值 ${overfitting.threshold}）→ ${overfitting.passes ? "通过多重检验校正" : "未通过，疑似样本内过拟合"}。传入 options.trials 以启用。`,
          ]
        : ["过拟合护栏：未启用（传入 options.trials>=2 以做 Deflated Sharpe/PBO 多重检验校正）。"]),
      TWO_SIDED_CROWDING_BACKTEST_NOTE,
    ],
  };
}

function formatPct(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

export function renderQuantBacktestReport(result: QuantBacktestResult): string {
  const latest = result.periods[result.periods.length - 1];
  const averageRankIc = avg(result.ic.map((item) => item.rankIc).filter((value): value is number => value != null));
  return [
    `# ${SERENITY_QUANT_BACKTEST}`,
    "",
    `Generated: ${result.generatedAt}`,
    `Periods: ${result.metrics.periods}`,
    `Portfolio: top ${result.options.portfolioSize}, max industry weight ${(result.options.maxIndustryWeight * 100).toFixed(0)}%, cost ${result.options.transactionCostBps + result.options.slippageBps} bps per traded notional`,
    "",
    "## Metrics",
    `- Total return: ${formatPct(result.metrics.totalReturn)} vs benchmark ${formatPct(result.metrics.benchmarkTotalReturn)}`,
    `- Annualized return: ${formatPct(result.metrics.annualizedReturn)} vs benchmark ${formatPct(result.metrics.benchmarkAnnualizedReturn)}`,
    `- Excess total return: ${formatPct(result.metrics.excessTotalReturn)}`,
    `- Max drawdown: ${formatPct(result.metrics.maxDrawdown)}`,
    `- Sharpe: ${formatNumber(result.metrics.sharpe, 2)}`,
    `- Calmar: ${formatNumber(result.metrics.calmar, 2)}`,
    `- Hit rate: ${formatPct(result.metrics.hitRate)}; avg turnover: ${formatPct(result.metrics.avgTurnover)}; avg traded weight: ${formatPct(result.metrics.avgTradedWeight)}`,
    `- Average rank IC: ${formatNumber(averageRankIc, 3)}`,
    result.overfitting
      ? `- Overfitting guard: trials=${result.overfitting.numTrials}, PSR>0=${formatNumber(result.overfitting.psrPositive, 3)}, Deflated Sharpe=${formatNumber(result.overfitting.deflatedSharpe.dsr, 3)} (threshold ${result.overfitting.threshold}) => ${result.overfitting.passes ? "PASS" : "FAIL (likely overfit)"}`
      : "- Overfitting guard: not run (pass options.trials>=2 to enable Deflated Sharpe correction)",
    "",
    latest
      ? [
          "## Latest Selection",
          ...latest.selected.slice(0, 20).map((position) => `- ${position.code}${position.name ? ` ${position.name}` : ""}: weight ${formatPct(position.weight)}, score ${position.score.toFixed(1)}, ${position.industry}${position.frozen ? " [frozen]" : ""}`),
          latest.blockedBuys.length > 0 ? `- Blocked buys: ${latest.blockedBuys.join("; ")}` : undefined,
          latest.blockedSells.length > 0 ? `- Blocked sells: ${latest.blockedSells.join("; ")}` : undefined,
        ]
          .filter((line): line is string => line != null)
          .join("\n")
      : "## Latest Selection\n- No periods.",
    "",
    "## Score Groups",
    ...result.groupReturns.map((group) => `- ${group.group}: avg ${formatPct(group.averageForwardReturn)}, win ${formatPct(group.winRate)}, n=${group.observations}`),
    "",
    "## Bucket Stats",
    ...result.bucketStats.map((bucket) => `- ${bucket.bucket}: avg forward ${formatPct(bucket.averageForwardReturn)}, selected ${bucket.selectedObservations}, avg weight ${formatPct(bucket.averageSelectedWeight)}`),
    "",
    "## Notes",
    ...result.notes.map((note) => `- ${note}`),
  ].join("\n");
}
