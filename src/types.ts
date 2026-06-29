export type SourceTier = "P0" | "P1" | "P2";
export type EvidencePolarity = "positive" | "negative" | "neutral";
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
  supportingConceptIds?: string[];
}

export interface Candidate {
  stock: AShareStock;
  matchedThemes: Array<{ themeId: string; label: string; keywords: string[] }>;
  score: number;
  confidence: "low" | "medium" | "high";
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
  noCrowdingPenalty: true;
}

export interface QuantScreenSummary {
  strategy: "Serenity Mainline Quant Overlay";
  generatedAt: string;
  noCrowdingPenalty: true;
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
  reportPath?: string;
  jsonPath?: string;
}

export interface WatchlistEvent {
  at: string;
  type: "created" | "updated" | "status-changed" | "score-changed" | "evidence-changed" | "review-scheduled";
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

export interface AnswerSafetyEvalResult {
  id: string;
  prompt: string;
  expectedPolicy: "refuse-execution-guidance";
  passed: boolean;
  detail: string;
}

// ---- Cross-market chokepoint mapping ----

export type ChokePointMapStatus =
  | "clean-equivalent" // an A-share constituent directly plays this chokepoint
  | "partial-overlap" // A-share serves the segment with material differences
  | "domestic-substitution-play" // 国产替代 angle; no direct global peer on A-share
  | "no-equivalent" // structural gap: no viable A-share play
  | "unverifiable"; // insufficient evidence to decide the mapping

export type GeopoliticalPolarity =
  | "guochanti-positive" // 国产替代 / supply-security premium
  | "export-control-risk" // OFAC / EAR / dual-use / sanction exposure
  | "neutral"
  | "mixed";

export type BottleneckMechanism =
  | "supply-constrained"
  | "capacity-gated"
  | "yield-limited"
  | "certification-slow"
  | "customer-verified"
  | "geopolitics";

export type ChinaSubstituteStatus =
  | "no-domestic-equivalent"
  | "emerging-domestic"
  | "established-domestic"
  | "overcrowded-domestic";

/**
 * A distilled, ticker-INDEPENDENT chokepoint concept. Serenity per-ticker calls
 * (e.g. SIVE) appear ONLY as globalExample / serenitySourceIds reference strings,
 * never as candidate evidence. Keyed to existing DEFAULT_THEMES via matchedThemeIds.
 */
export interface ChokePointConcept {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  bottleneckMechanism: BottleneckMechanism;
  matchedThemeIds: string[];
  aShareIndustryKeywords: string[];
  aShareConceptKeywords: string[];
  globalExample?: string;
  serenitySourceIds: string[];
  chinaSubstituteStatus: ChinaSubstituteStatus;
  geopoliticalPolarity: GeopoliticalPolarity;
  observedAt: string;
  expiresAt?: string;
}

/** A US/HK thesis projected onto an A-share segment as a research direction (P2). */
export interface ChokePointInquiry {
  conceptId: string;
  lineOfInquiry: string[];
  mapStatus: ChokePointMapStatus;
}

/**
 * Provenance partition for a candidate surfaced via a chokepoint concept.
 * Serenity material is isolated into serenityContext and can NEVER appear in candidateLevelP0.
 */
export interface ChokePointProvenance {
  candidateCode: string;
  candidateName: string;
  conceptId: string;
  globalExample?: string;
  mapStatus: ChokePointMapStatus;
  geopoliticalPolarity: GeopoliticalPolarity;
  candidateLevelP0: SourceRecord[];
  corroboratingAShareSources: SourceRecord[];
  serenityContext: SourceRecord[];
  geopoliticalNotes: string[];
  confidenceAdjustment: string;
}

/** Result of resolving one concept to live A-share constituents via FFD + scoreCandidate. */
export interface ChokePointResolution {
  conceptId: string;
  conceptNameZh: string;
  resolutionMethod: "ffd_industry_stocks" | "ffd_screen_stocks" | "ffd_search_stocks" | "static-universe";
  resolutionQuery: string;
  mapStatus: ChokePointMapStatus;
  lineOfInquiry: string[];
  candidates: Candidate[];
  provenance: ChokePointProvenance[];
  resolutionGaps: string[];
  resolutionTimestamp: string;
}
