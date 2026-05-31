export type SourceTier = "P0" | "P1" | "P2";
export type EvidencePolarity = "positive" | "negative" | "neutral";

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

export interface ScoreComponent {
  name: string;
  score: number;
  maxScore: number;
  reason: string;
  sourceIds: string[];
}

export interface MethodologyTrace {
  priorScore: number;
  posteriorScore: number;
  expectedValueScore: number;
  components: ScoreComponent[];
  evidence: EvidenceItem[];
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
}

export interface Candidate {
  stock: AShareStock;
  matchedThemes: Array<{ themeId: string; label: string; keywords: string[] }>;
  score: number;
  confidence: "low" | "medium" | "high";
  trace: MethodologyTrace;
  generatedAt: string;
}

export interface ScreenRun {
  runId: string;
  generatedAt: string;
  candidates: Candidate[];
  totalStocksScanned: number;
  sourceCount: number;
  reportPath?: string;
  jsonPath?: string;
}
