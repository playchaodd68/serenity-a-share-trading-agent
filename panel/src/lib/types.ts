/**
 * 面板数据类型 — 镜像后端类型定义。
 *
 * Source of truth（勿在此扩展语义，仅镜像面板需要的字段）：
 * - src/types.ts                      （ScreenRun/Candidate/Watchlist/Calibration/Resolution/Graveyard 等）
 * - src/quant/backtest.ts             （QuantBacktestResult 及其子结构）
 * - src/quant/overfitting.ts          （OverfittingGuard/CscvResult）
 * - src/connectors/limit-up-ladder.ts （LimitUpLadderSnapshot）
 * - src/research/report-library.ts    （FfdReportManifest）
 * - src/research/decision-log.ts      （DecisionLogEntry）
 * 后端 schema 变更时必须同步本文件。
 */

// ===== 基础枚举（src/types.ts） =====

export type SourceTier = "P0" | "P1" | "P2";
export type EvidencePolarity = "positive" | "negative" | "neutral";
export type ConfidenceLevel = "low" | "medium" | "high";
export type WatchlistStatus = "evidence-needed" | "investigating" | "validated" | "downgraded" | "archived";

// ===== 筛选批次（src/types.ts） =====

export interface AShareStock {
  code: string;
  name: string;
  latestPrice: number | null;
  pctChange: number | null;
  totalMarketCap: number | null;
  floatMarketCap: number | null;
  pe: number | null;
  turnover: number | null;
  mainNetInflow: number | null;
  industry: string;
  region: string;
  concept: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  tier: SourceTier;
  polarity: EvidencePolarity;
  weight: number;
  description: string;
  sourceIds: string[];
  tags: string[];
}

export interface ResearchEvidence {
  id: string;
  candidateCode: string;
  candidateName: string;
  sourceId: string;
  tier: SourceTier;
  kind: string;
  polarity: EvidencePolarity;
  confidence: number;
  title: string;
  snippet: string;
  tags: string[];
  direct: boolean;
  observedAt: string;
}

export interface ScoreComponent {
  name: string;
  score: number;
  maxScore: number;
  reason: string;
  sourceIds: string[];
}

export interface IndustryLogicAssessment {
  primaryTrendScore: number;
  bottleneckDepthScore: number;
  supplyDemandProfitScore: number;
  expectationGapScore: number;
  totalScore: number;
  thesis: string;
  validationWindow: string;
  keySignals: string[];
  missingSignals: string[];
}

export type KillCriterionCategory =
  | "evidence-gap"
  | "expectation-window"
  | "negative-signal"
  | "supply-release"
  | "valuation"
  | "bear-falsifier";

export interface KillCriterion {
  id: string;
  category: KillCriterionCategory;
  trigger: string;
  dueDate: string;
  sourceCheck: string;
  posteriorDelta: number;
  signal?: string;
}

export type CatalystCategory = "earnings" | "capacity" | "certification" | "pricing";

export interface CatalystCriterion {
  id: string;
  category: CatalystCategory;
  trigger: string;
  dueDate: string;
  sourceCheck: string;
  posteriorDelta: number;
  confirms: string;
}

export interface HypeRiskAssessment {
  hitSignals: string[];
  reflexivityFlag: boolean;
  penalty: number;
}

export interface DisqualifierAssessment {
  hitSignals: string[];
  triggered: boolean;
}

export interface MethodologyTrace {
  priorScore: number;
  posteriorScore: number;
  expectedValueScore: number;
  industryLogic?: IndustryLogicAssessment;
  components: ScoreComponent[];
  evidence: EvidenceItem[];
  structuredEvidence?: ResearchEvidence[];
  nextActions?: string[];
  risks: string[];
  coverageGaps: string[];
  killCriteria?: KillCriterion[];
  catalysts?: CatalystCriterion[];
  negativeSignals?: string[];
  supplyReleaseSignals?: string[];
  hypeRisk?: HypeRiskAssessment;
  disqualifiers?: DisqualifierAssessment;
  confidenceCeiling?: ConfidenceLevel;
  ceilingReasons?: string[];
}

export interface HotThemeDowngrade {
  themeId: string;
  label: string;
  heatScore: number;
  avgTurnover: number;
  avgPctChange: number;
  candidateCount: number;
  hasStrongEvidence: boolean;
  downgraded: boolean;
  reason: string;
}

export interface Candidate {
  stock: AShareStock;
  matchedThemes: Array<{ themeId: string; label: string; keywords: string[] }>;
  score: number;
  confidence: ConfidenceLevel;
  trace: MethodologyTrace;
  generatedAt: string;
}

export interface ScreenRun {
  runId: string;
  generatedAt: string;
  candidates: Candidate[];
  totalStocksScanned: number;
  sourceCount: number;
  hotThemeDowngrades?: HotThemeDowngrade[];
  reportPath?: string;
  jsonPath?: string;
}

// ===== Watchlist（src/types.ts） =====

export interface WatchlistEvent {
  at: string;
  type:
    | "created"
    | "updated"
    | "status-changed"
    | "score-changed"
    | "evidence-changed"
    | "review-scheduled"
    | "kill-triggered";
  detail: string;
}

export interface WatchlistEntry {
  code: string;
  name: string;
  status: WatchlistStatus;
  score: number;
  confidence: ConfidenceLevel;
  firstSeenAt: string;
  lastSeenAt: string;
  nextReviewAt: string;
  evidenceState: {
    hasCandidateP0: boolean;
    directEvidenceCount: number;
    corroboratingEvidenceCount: number;
    riskEvidenceCount: number;
  };
  coverageGaps: string[];
  nextActions: string[];
  events: WatchlistEvent[];
  killCriteria?: KillCriterion[];
  catalysts?: CatalystCriterion[];
}

// ===== 校准（src/types.ts） =====

export interface CalibrationSnapshot {
  generatedAt: string;
  reportsAnalyzed: number;
  candidatesAnalyzed: number;
  scoreDistribution: Record<string, number>;
  confidenceDistribution: Record<ConfidenceLevel, number>;
  recurringCoverageGaps: Array<{ gap: string; count: number }>;
  latestCoverageGaps: Array<{ gap: string; count: number }>;
  candidateChurn: {
    latestRunId?: string;
    previousRunId?: string;
    entered: string[];
    exited: string[];
    retained: string[];
  };
}

export interface CandidateResolution {
  code: string;
  name: string;
  posterior: number;
  probability: number;
  confidence: ConfidenceLevel;
  evidenceTier: "P0-anchored" | "P0-capped";
  entryDate: string;
  horizonDays: number;
  stockReturn: number;
  benchmarkReturn: number;
  realizedAlpha: number;
  outcome: 0 | 1;
  outcomeLabel: "validated" | "falsified" | "inconclusive";
  brier: number;
  resolvedAt: string;
}

export interface ReliabilityBin {
  bucket: string;
  count: number;
  meanConfidence: number;
  empiricalRate: number;
  brier: number;
}

export interface ResolutionTierStat<T extends string> {
  tier: T;
  count: number;
  meanPosterior: number;
  empiricalHitRate: number;
  brier: number;
}

export interface ResolutionCalibration {
  generatedAt: string;
  resolved: number;
  brierMean: number;
  logScoreMean: number;
  ece: number;
  overconfidenceGap: number;
  reliabilityBins: ReliabilityBin[];
  byConfidenceTier: Array<ResolutionTierStat<ConfidenceLevel>>;
  byEvidenceTier: Array<ResolutionTierStat<CandidateResolution["evidenceTier"]>>;
}

// ===== 墓地（src/types.ts） =====

export type GraveyardReason = "below-entry-bar" | "kill-triggered" | "downgraded" | "manual-reject";

export interface GraveyardEntry {
  code: string;
  name: string;
  reason: GraveyardReason;
  score: number;
  confidence: ConfidenceLevel;
  matchedThemes: string[];
  killedCriterionIds: string[];
  detail: string;
  buriedAt: string;
  realizedAlpha?: number;
  outcomeLabel?: CandidateResolution["outcomeLabel"];
}

export interface GraveyardSummary {
  total: number;
  byReason: Record<string, number>;
  byTheme: Array<{ theme: string; count: number }>;
  resolvedWithOutcome: number;
  buriedHitRate: number | null;
}

// ===== 决策日志（src/research/decision-log.ts） =====

export interface DecisionLogEntry {
  id: string;
  code: string;
  name: string;
  runId: string;
  decidedAt: string;
  score: number;
  confidence: ConfidenceLevel;
  probability: number;
  status: "pending" | "resolved";
  resolvedAt?: string;
  realizedAlpha?: number;
  outcomeLabel?: CandidateResolution["outcomeLabel"];
  brier?: number;
  reflection?: string;
}

// ===== 连板梯队（src/connectors/limit-up-ladder.ts；梯队高度是负面拥挤度信号） =====

export interface LimitUpStock {
  code: string;
  name: string;
  industry: string;
  pctChange: number | null;
  /** 连板数 */
  height: number;
  /** 封单金额（元），脏行为 null */
  sealAmount: number | null;
  /** 开板/炸板次数 */
  brokenCount: number;
  /** 首次封板时间 "HH:MM"，缺失为空串 */
  firstSealTime: string;
}

export interface LadderTier {
  height: number;
  stocks: LimitUpStock[];
}

export interface LimitUpLadderStats {
  limitUpCount: number;
  brokenCount: number | null;
  brokenRate: number | null;
  maxHeight: number;
}

export interface LimitUpLadderSnapshot {
  /** YYYY-MM-DD */
  date: string;
  ladder: LadderTier[];
  stats: LimitUpLadderStats;
}

// ===== 回测（src/quant/backtest.ts + src/quant/overfitting.ts） =====

export type QuantCandidateBucket = "core" | "watchlist" | "observe" | "reject";
export type QuantEvidenceGate = "pass" | "watchlist" | "fail";

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
  blockedExitDays?: number;
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

export interface QuantBacktestExecutionStats {
  buyBlockedOnePriceLimitUp: number;
  sellBlockedOnePriceLimitDown: number;
  sellBlockedSuspended: number;
  pendingExits: number;
  blockedExitDays: number;
}

export interface DeflatedSharpeResult {
  sr0: number;
  dsr: number;
}

export interface OverfittingGuard {
  periods: number;
  numTrials: number;
  perPeriodSharpe: number;
  skewness: number;
  kurtosis: number;
  psrPositive: number;
  deflatedSharpe: DeflatedSharpeResult;
  threshold: number;
  passes: boolean;
}

export interface CscvResult {
  pbo: number;
  nConfigs: number;
  nBlocks: number;
  nCombinations: number;
  logits: number[];
  medianLogit: number;
  probabilityOfLoss: number;
  performanceDegradation: { inSample: number; outOfSample: number };
}

export interface QuantBacktestResult {
  strategy: "Serenity Mainline Quant Backtest";
  generatedAt: string;
  options: EffectiveQuantBacktestOptions;
  periods: QuantBacktestPeriodResult[];
  metrics: QuantBacktestMetrics;
  ic: QuantBacktestIc[];
  groupReturns: QuantBacktestGroupReturn[];
  bucketStats: QuantBacktestBucketStat[];
  executionStats: QuantBacktestExecutionStats;
  overfitting?: OverfittingGuard;
  cscv?: CscvResult;
  notes: string[];
}

// ===== FFD 研报（src/research/report-library.ts，面板只镜像展示所需字段） =====

export type FfdReportStatus = "downloaded" | "staged" | "accepted" | "rejected" | "archived";

export interface FfdReportManifest {
  id: string;
  title: string;
  fileName: string;
  status: FfdReportStatus;
  provider: "FFD";
  sourceTier: "P1";
  sourceType: "broker_report";
  institution?: string;
  industry?: string;
  publishedAt?: string;
  convertedAt: string;
  summary: string;
  tags: string[];
  topics?: string[];
  companies?: string[];
  claimCount: number;
  chunkCount: number;
  sectionCount?: number;
  evidenceCount?: number;
  tableCount?: number;
  imageCount?: number;
  textCharCount?: number;
}

// ===== 面板聚合端点响应（蓝图 §3；由 src/panel/server.ts 组装） =====

export interface PanelHealth {
  ok: boolean;
  version?: string;
  dataFreshness: {
    latestScreenRunId?: string;
    latestScreenAt?: string;
    calibrationAt?: string;
    backtestAt?: string;
    watchlistUpdatedAt?: string;
  };
}

export interface OverviewDueEntry {
  code: string;
  name: string;
  status: WatchlistStatus;
  score: number;
  nextReviewAt: string;
  hasCandidateP0: boolean;
  riskEvidenceCount: number;
}

export interface OverviewResponse {
  latestRun: {
    runId: string;
    generatedAt: string;
    candidateCount: number;
    totalStocksScanned: number;
    sourceCount: number;
    hotThemeDowngrades: HotThemeDowngrade[];
  } | null;
  watchlist: {
    total: number;
    byStatus: Record<WatchlistStatus, number>;
    dueForReview: OverviewDueEntry[];
  };
  calibration: CalibrationSnapshot | null;
  portfolio: { updatedAt: string; positionCount: number };
  ladder: (LimitUpLadderStats & { date: string }) | null;
}

export interface ScreenRunSummary {
  runId: string;
  generatedAt: string;
  candidateCount: number;
  totalStocksScanned: number;
  sourceCount: number;
}

export interface GraveyardResponse {
  summary: GraveyardSummary;
  total: number;
  entries: GraveyardEntry[];
}

export interface ResolutionsResponse {
  calibration: ResolutionCalibration | null;
  resolutions: CandidateResolution[];
}

export interface DecisionLogResponse {
  summary: { total: number; pending: number; resolved: number; validatedRate: number | null };
  entries: DecisionLogEntry[];
}

export interface LadderHistoryPoint {
  date: string;
  stats: LimitUpLadderStats;
}

export interface PortfolioPositionView {
  code: string;
  name: string;
  note?: string;
  watchlist?: Pick<WatchlistEntry, "status" | "score" | "confidence" | "nextReviewAt">;
  latestScreenScore?: number;
  graveyard?: Pick<GraveyardEntry, "reason" | "buriedAt" | "detail">;
}

export interface PortfolioResponse {
  updatedAt: string;
  positions: PortfolioPositionView[];
}
