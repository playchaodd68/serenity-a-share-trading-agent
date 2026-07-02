export type SourceTier = "P0" | "P1" | "P2";
export type EvidencePolarity = "positive" | "negative" | "neutral";
export type ConfidenceLevel = "low" | "medium" | "high";
export type ResearchEvidenceKind =
  | "primary-filing"
  | "broker-report"
  | "industry-signal"
  | "market-signal"
  | "framework-inference"
  | "risk";
export type SupplyChainNodeType = "candidate" | "theme" | "product" | "source" | "customer" | "supplier" | "risk";
export type SupplyChainEdgeType = "matches-theme" | "supported-by" | "mentions-product" | "customer-signal" | "supplier-signal" | "risk-from";
export type WatchlistStatus = "evidence-needed" | "investigating" | "validated" | "downgraded" | "archived";

export interface SourceRecord {
  id: string;
  title: string;
  tier: SourceTier;
  sourceType: "primary" | "broker_report" | "industry" | "social" | "repo" | "local_file" | "system";
  publisher: string;
  observedAt: string;
  url?: string;
  path?: string;
  summary: string;
  evidenceTags: string[];
  provider?: string;
  institution?: string;
  publishedAt?: string;
  licenseMode?: "public" | "user-licensed-local" | "vendor-entitled" | "metadata-only";
  canQuote?: boolean;
  canStoreFullText?: boolean;
  canUseInLLM?: boolean;
  externalId?: string;
  checksum?: string;
  reviewStatus?: "downloaded" | "staged" | "accepted" | "rejected" | "archived";
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
  kind: ResearchEvidenceKind;
  polarity: EvidencePolarity;
  confidence: number;
  title: string;
  snippet: string;
  tags: string[];
  direct: boolean;
  observedAt: string;
}

export interface EvidenceSummary {
  direct: ResearchEvidence[];
  corroborating: ResearchEvidence[];
  risks: ResearchEvidence[];
  strongest: ResearchEvidence[];
  hasCandidateP0: boolean;
  nextActions: string[];
}

export interface SupplyChainNode {
  id: string;
  label: string;
  type: SupplyChainNodeType;
  tags: string[];
}

export interface SupplyChainEdge {
  id: string;
  from: string;
  to: string;
  type: SupplyChainEdgeType;
  sourceIds: string[];
  tier: SourceTier;
  polarity: EvidencePolarity;
  confidence: number;
  direct: boolean;
  description: string;
}

export interface SupplyChainGraph {
  candidateCode: string;
  generatedAt: string;
  nodes: SupplyChainNode[];
  edges: SupplyChainEdge[];
  unresolvedLinks: string[];
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

export interface MethodologyTrace {
  priorScore: number;
  posteriorScore: number;
  expectedValueScore: number;
  industryLogic?: IndustryLogicAssessment;
  components: ScoreComponent[];
  evidence: EvidenceItem[];
  structuredEvidence?: ResearchEvidence[];
  graph?: SupplyChainGraph;
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

export interface BottleneckTheme {
  id: string;
  label: string;
  keywords: string[];
  positiveSignals: string[];
  negativeSignals: string[];
}

export interface NegativeSignalAssessment {
  matched: Array<{ themeId: string; label: string; signals: string[] }>;
  hitSignals: string[];
  penalty: number;
}

export interface SupplyReleaseAssessment {
  hitTerms: string[];
  penalty: number;
}

// Trading-side crowding (hype) is scored separately from supply-side concentration
// (chokepoint strength). Reflexivity flag marks price action driven only by P2/social
// signals with no new P0/P1 evidence in the candidate's source set.
export interface HypeRiskAssessment {
  hitSignals: string[];
  reflexivityFlag: boolean;
  penalty: number;
}

// Hard vetoes that cap confidence regardless of additive score (not bounded by the
// negative-penalty caps): 立案调查 / 财务造假 / 清仓式减持 / ST 标签等。
export interface DisqualifierAssessment {
  hitSignals: string[];
  triggered: boolean;
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

export type KillCriterionCategory =
  | "evidence-gap"
  | "expectation-window"
  | "negative-signal"
  | "supply-release"
  | "valuation";

export interface KillCriterion {
  id: string;
  category: KillCriterionCategory;
  trigger: string;
  dueDate: string;
  sourceCheck: string;
  posteriorDelta: number;
  signal?: string;
}

// Positive mirror of KillCriterion (N3/N4): pre-registered, dated events that would
// confirm the thesis. Resolution uses them to tell "fundamental-confirmed rise" from
// "unconfirmed rise" (reflexivity/beta), which keeps the calibration slices clean.
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

export interface Candidate {
  stock: AShareStock;
  matchedThemes: Array<{ themeId: string; label: string; keywords: string[] }>;
  score: number;
  confidence: ConfidenceLevel;
  trace: MethodologyTrace;
  quant?: QuantCandidateOverlay;
  generatedAt: string;
}

export type QuantIndustryTier = "A" | "B" | "C" | "Reject";
export type QuantCandidateBucket = "core" | "watchlist" | "observe" | "reject";
export type QuantEvidenceGate = "pass" | "watchlist" | "fail";
export type QuantRiskMode = "RiskOn" | "Rebalance" | "RiskOff";

export interface QuantScoreComponent {
  name: string;
  score: number;
  maxScore: number;
  reason: string;
  sourceIds: string[];
  kind: "positive" | "penalty" | "observation";
}

export interface QuantIndustryScore {
  industryKey: string;
  score: number;
  tier: QuantIndustryTier;
  components: QuantScoreComponent[];
  notes: string[];
}

export interface QuantTechnicalConfirmation {
  trend: string;
  volumePrice: string;
  liquidity: string;
  marketConsensus: string;
}

export interface QuantCandidateOverlay {
  strategy: "Serenity Mainline Quant Overlay";
  generatedAt: string;
  stockScore: number;
  bucket: QuantCandidateBucket;
  evidenceGate: QuantEvidenceGate;
  industry: QuantIndustryScore;
  components: QuantScoreComponent[];
  technicalConfirmation: QuantTechnicalConfirmation;
  warnings: string[];
  excludedReasons: string[];
  crowdingPolicy: "two-sided";
  // Deterministic valuation hard gate: caps the reachable bucket; narrative strength
  // and chokepoint purity cannot override it.
  valuationGate?: {
    light: "red" | "yellow" | "green" | "unknown";
    maxBucket: "core" | "watchlist" | "observe";
    reasons: string[];
  };
}

export interface QuantScreenSummary {
  strategy: "Serenity Mainline Quant Overlay";
  generatedAt: string;
  crowdingPolicy: "two-sided";
  riskMode: QuantRiskMode;
  bucketCounts: Record<QuantCandidateBucket, number>;
  industryTiers: Array<{ industryKey: string; score: number; tier: QuantIndustryTier; candidateCount: number }>;
  notes: string[];
}

export interface ScreenRun {
  runId: string;
  generatedAt: string;
  candidates: Candidate[];
  totalStocksScanned: number;
  sourceCount: number;
  quantSummary?: QuantScreenSummary;
  // Forced hot-theme downgrade slot: every screen must rank theme heat and state which
  // popular direction is deliberately downgraded (or why none qualifies).
  hotThemeDowngrades?: HotThemeDowngrade[];
  reportPath?: string;
  jsonPath?: string;
}

export interface WatchlistEvent {
  at: string;
  type: "created" | "updated" | "status-changed" | "score-changed" | "evidence-changed" | "review-scheduled" | "kill-triggered";
  detail: string;
}

export interface WatchlistEntry {
  code: string;
  name: string;
  status: WatchlistStatus;
  score: number;
  confidence: Candidate["confidence"];
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

export interface CalibrationSnapshot {
  generatedAt: string;
  reportsAnalyzed: number;
  candidatesAnalyzed: number;
  scoreDistribution: Record<string, number>;
  confidenceDistribution: Record<Candidate["confidence"], number>;
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
  confidence: Candidate["confidence"];
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
  byConfidenceTier: Array<ResolutionTierStat<Candidate["confidence"]>>;
  byEvidenceTier: Array<ResolutionTierStat<CandidateResolution["evidenceTier"]>>;
}

export type GraveyardReason = "below-entry-bar" | "kill-triggered" | "downgraded" | "manual-reject";

export interface GraveyardEntry {
  code: string;
  name: string;
  reason: GraveyardReason;
  score: number;
  confidence: Candidate["confidence"];
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

export interface AnswerSafetyEvalResult {
  id: string;
  prompt: string;
  expectedPolicy: "refuse-execution-guidance";
  passed: boolean;
  detail: string;
}
