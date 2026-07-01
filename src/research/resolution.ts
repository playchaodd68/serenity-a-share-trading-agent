import path from "node:path";
import type {
  Candidate,
  CandidateResolution,
  ReliabilityBin,
  ResolutionCalibration,
  ResolutionTierStat,
} from "../types.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";

export const RESOLUTIONS_PATH = path.resolve("runs/resolutions.json");

const DEFAULT_HORIZON_DAYS = 20;
const DEFAULT_ALPHA_DEADBAND = 0.02;
const LOG_EPSILON = 1e-9;

// A resolution grades a past posterior against realized forward alpha versus the
// candidate's own benchmark (industry / CSI index), closing the previously open
// Bayesian loop: the system finally learns whether a "70 后验" resolves ~70% of the time.

export interface PriceReturnObservation {
  stockReturn: number;
  benchmarkReturn: number;
}

export type PriceReturnProvider = (input: {
  code: string;
  entryDate: string;
  horizonDays: number;
}) => Promise<PriceReturnObservation | null>;

export interface ResolveCandidateInput {
  code: string;
  name: string;
  posterior: number;
  confidence: Candidate["confidence"];
  evidenceAnchored: boolean;
  entryDate: string;
  horizonDays?: number;
}

export interface ResolveCandidateOptions {
  alphaDeadband?: number;
  now?: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function brierScore(probability: number, outcome: 0 | 1): number {
  const p = clamp01(probability);
  return (p - outcome) ** 2;
}

export function logScore(probability: number, outcome: 0 | 1): number {
  const p = clamp01(probability);
  return outcome === 1 ? Math.log(Math.max(p, LOG_EPSILON)) : Math.log(Math.max(1 - p, LOG_EPSILON));
}

export async function resolveCandidate(
  input: ResolveCandidateInput,
  provider: PriceReturnProvider,
  options: ResolveCandidateOptions = {},
): Promise<CandidateResolution | null> {
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const deadband = options.alphaDeadband ?? DEFAULT_ALPHA_DEADBAND;
  const observation = await provider({ code: input.code, entryDate: input.entryDate, horizonDays });
  if (!observation) return null;

  const realizedAlpha = observation.stockReturn - observation.benchmarkReturn;
  const outcome: 0 | 1 = realizedAlpha >= 0 ? 1 : 0;
  const outcomeLabel: CandidateResolution["outcomeLabel"] =
    realizedAlpha >= deadband ? "validated" : realizedAlpha <= -deadband ? "falsified" : "inconclusive";
  const probability = clamp01(input.posterior / 100);

  return {
    code: input.code,
    name: input.name,
    posterior: input.posterior,
    probability,
    confidence: input.confidence,
    evidenceTier: input.evidenceAnchored ? "P0-anchored" : "P0-capped",
    entryDate: input.entryDate,
    horizonDays,
    stockReturn: observation.stockReturn,
    benchmarkReturn: observation.benchmarkReturn,
    realizedAlpha,
    outcome,
    outcomeLabel,
    brier: brierScore(probability, outcome),
    resolvedAt: options.now ?? new Date().toISOString(),
  };
}

export async function resolveCandidates(
  inputs: ResolveCandidateInput[],
  provider: PriceReturnProvider,
  options: ResolveCandidateOptions = {},
): Promise<CandidateResolution[]> {
  const settled = await Promise.all(inputs.map((input) => resolveCandidate(input, provider, options)));
  return settled.filter((resolution): resolution is CandidateResolution => resolution != null);
}

const RELIABILITY_BUCKETS = [
  { bucket: "0.0-0.2", min: 0, max: 0.2 },
  { bucket: "0.2-0.4", min: 0.2, max: 0.4 },
  { bucket: "0.4-0.6", min: 0.4, max: 0.6 },
  { bucket: "0.6-0.8", min: 0.6, max: 0.8 },
  { bucket: "0.8-1.0", min: 0.8, max: 1.01 },
];

function tierStat<T extends string>(tier: T, group: CandidateResolution[]): ResolutionTierStat<T> {
  return {
    tier,
    count: group.length,
    meanPosterior: mean(group.map((item) => item.posterior)),
    empiricalHitRate: mean(group.map((item) => item.outcome)),
    brier: mean(group.map((item) => item.brier)),
  };
}

export function buildResolutionCalibration(
  resolutions: CandidateResolution[],
  now = new Date().toISOString(),
): ResolutionCalibration {
  const resolved = resolutions.length;
  if (resolved === 0) {
    return {
      generatedAt: now,
      resolved: 0,
      brierMean: 0,
      logScoreMean: 0,
      ece: 0,
      overconfidenceGap: 0,
      reliabilityBins: [],
      byConfidenceTier: [],
      byEvidenceTier: [],
    };
  }

  const reliabilityBins: ReliabilityBin[] = RELIABILITY_BUCKETS.map(({ bucket, min, max }) => {
    const group = resolutions.filter((item) => item.probability >= min && item.probability < max);
    return {
      bucket,
      count: group.length,
      meanConfidence: mean(group.map((item) => item.probability)),
      empiricalRate: mean(group.map((item) => item.outcome)),
      brier: mean(group.map((item) => item.brier)),
    };
  }).filter((bin) => bin.count > 0);

  const ece = reliabilityBins.reduce(
    (sum, bin) => sum + (bin.count / resolved) * Math.abs(bin.meanConfidence - bin.empiricalRate),
    0,
  );

  const confidenceTiers: Candidate["confidence"][] = ["low", "medium", "high"];
  const evidenceTiers: CandidateResolution["evidenceTier"][] = ["P0-anchored", "P0-capped"];

  return {
    generatedAt: now,
    resolved,
    brierMean: mean(resolutions.map((item) => item.brier)),
    logScoreMean: mean(resolutions.map((item) => logScore(item.probability, item.outcome))),
    ece,
    overconfidenceGap: mean(resolutions.map((item) => item.probability)) - mean(resolutions.map((item) => item.outcome)),
    reliabilityBins,
    byConfidenceTier: confidenceTiers
      .map((tier) => tierStat(tier, resolutions.filter((item) => item.confidence === tier)))
      .filter((stat) => stat.count > 0),
    byEvidenceTier: evidenceTiers
      .map((tier) => tierStat(tier, resolutions.filter((item) => item.evidenceTier === tier)))
      .filter((stat) => stat.count > 0),
  };
}

export function renderResolutionCalibration(report: ResolutionCalibration): string {
  if (report.resolved === 0) return "Resolution calibration: no resolved candidates yet.";
  return [
    `Resolution calibration: resolved=${report.resolved}, Brier=${report.brierMean.toFixed(3)}, LogScore=${report.logScoreMean.toFixed(3)}, ECE=${report.ece.toFixed(3)}`,
    `Overconfidence gap (meanConfidence - hitRate): ${report.overconfidenceGap.toFixed(3)}`,
    ...report.byConfidenceTier.map(
      (tier) =>
        `Confidence ${tier.tier}: n=${tier.count}, meanPosterior=${tier.meanPosterior.toFixed(1)}, hitRate=${(tier.empiricalHitRate * 100).toFixed(0)}%, Brier=${tier.brier.toFixed(3)}`,
    ),
    ...report.byEvidenceTier.map(
      (tier) => `Evidence ${tier.tier}: n=${tier.count}, hitRate=${(tier.empiricalHitRate * 100).toFixed(0)}%, Brier=${tier.brier.toFixed(3)}`,
    ),
    ...report.reliabilityBins.map(
      (bin) => `Reliability ${bin.bucket}: n=${bin.count}, conf=${bin.meanConfidence.toFixed(2)}, actual=${bin.empiricalRate.toFixed(2)}`,
    ),
  ].join("\n");
}

export async function loadResolutions(filePath = RESOLUTIONS_PATH): Promise<CandidateResolution[]> {
  return readJsonFile<CandidateResolution[]>(filePath, []);
}

export async function saveResolutions(resolutions: CandidateResolution[], filePath = RESOLUTIONS_PATH): Promise<void> {
  await writeJsonFile(filePath, resolutions);
}
