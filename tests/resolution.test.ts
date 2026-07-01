import { describe, expect, it } from "vitest";
import {
  brierScore,
  buildResolutionCalibration,
  logScore,
  renderResolutionCalibration,
  resolveCandidate,
} from "../src/research/resolution.js";
import type { ResolveCandidateInput } from "../src/research/resolution.js";
import type { CandidateResolution } from "../src/types.js";

const baseInput: ResolveCandidateInput = {
  code: "688999",
  name: "测试硅光",
  posterior: 70,
  confidence: "medium",
  evidenceAnchored: true,
  entryDate: "2026-05-01",
  horizonDays: 20,
};

describe("proper scoring rules", () => {
  it("brier score is 0 for a perfect prediction and 1 for a fully wrong one", () => {
    expect(brierScore(1, 1)).toBe(0);
    expect(brierScore(0, 1)).toBe(1);
    expect(brierScore(0.5, 1)).toBeCloseTo(0.25, 10);
    expect(brierScore(0.7, 0)).toBeCloseTo(0.49, 10);
  });

  it("log score rewards confident correct predictions over hedged ones", () => {
    expect(logScore(0.9, 1)).toBeGreaterThan(logScore(0.6, 1));
    expect(Number.isFinite(logScore(0, 1))).toBe(true);
  });
});

describe("candidate resolution", () => {
  it("labels a candidate validated when it beats its benchmark and scores the posterior", async () => {
    const resolution = await resolveCandidate(baseInput, async () => ({ stockReturn: 0.2, benchmarkReturn: 0.05 }));
    expect(resolution).not.toBeNull();
    expect(resolution!.realizedAlpha).toBeCloseTo(0.15, 10);
    expect(resolution!.outcome).toBe(1);
    expect(resolution!.outcomeLabel).toBe("validated");
    expect(resolution!.brier).toBeCloseTo(0.09, 10); // (0.7 - 1)^2
    expect(resolution!.evidenceTier).toBe("P0-anchored");
  });

  it("labels a candidate falsified when it underperforms its benchmark", async () => {
    const resolution = await resolveCandidate(baseInput, async () => ({ stockReturn: -0.1, benchmarkReturn: 0.05 }));
    expect(resolution!.outcome).toBe(0);
    expect(resolution!.outcomeLabel).toBe("falsified");
    expect(resolution!.brier).toBeCloseTo(0.49, 10); // (0.7 - 0)^2
  });

  it("marks small positive alpha inside the deadband as inconclusive but still scores the sign", async () => {
    const resolution = await resolveCandidate(baseInput, async () => ({ stockReturn: 0.051, benchmarkReturn: 0.05 }));
    expect(resolution!.outcomeLabel).toBe("inconclusive");
    expect(resolution!.outcome).toBe(1);
  });

  it("marks small negative alpha inside the deadband as inconclusive with outcome 0", async () => {
    const resolution = await resolveCandidate(baseInput, async () => ({ stockReturn: -0.01, benchmarkReturn: 0 }));
    expect(resolution!.outcomeLabel).toBe("inconclusive");
    expect(resolution!.outcome).toBe(0);
  });

  it("returns null when the price provider has no data", async () => {
    const resolution = await resolveCandidate(baseInput, async () => null);
    expect(resolution).toBeNull();
  });

  it("marks P0-capped when the candidate has no anchoring primary evidence", async () => {
    const resolution = await resolveCandidate(
      { ...baseInput, evidenceAnchored: false },
      async () => ({ stockReturn: 0.2, benchmarkReturn: 0.05 }),
    );
    expect(resolution!.evidenceTier).toBe("P0-capped");
  });
});

describe("resolution calibration", () => {
  function resolution(partial: Partial<CandidateResolution>): CandidateResolution {
    return {
      code: partial.code ?? "000000",
      name: partial.name ?? "sample",
      posterior: partial.posterior ?? 80,
      probability: (partial.posterior ?? 80) / 100,
      confidence: partial.confidence ?? "high",
      evidenceTier: partial.evidenceTier ?? "P0-anchored",
      entryDate: "2026-05-01",
      horizonDays: 20,
      stockReturn: 0,
      benchmarkReturn: 0,
      realizedAlpha: partial.realizedAlpha ?? 0,
      outcome: partial.outcome ?? 1,
      outcomeLabel: partial.outcomeLabel ?? "validated",
      brier: brierScore((partial.posterior ?? 80) / 100, partial.outcome ?? 1),
      resolvedAt: "2026-06-01T00:00:00.000Z",
    };
  }

  it("detects overconfidence when high-posterior calls only resolve half the time", () => {
    const resolutions: CandidateResolution[] = [
      resolution({ code: "a", posterior: 80, confidence: "high", outcome: 1 }),
      resolution({ code: "b", posterior: 80, confidence: "high", outcome: 0 }),
    ];
    const report = buildResolutionCalibration(resolutions, "2026-06-01T01:00:00.000Z");
    expect(report.resolved).toBe(2);
    // mean confidence 0.8, empirical hit rate 0.5 => overconfident by 0.3
    expect(report.overconfidenceGap).toBeCloseTo(0.3, 10);
    // (0.8-1)^2=0.04 and (0.8-0)^2=0.64 => mean 0.34
    expect(report.brierMean).toBeCloseTo(0.34, 10);
  });

  it("aggregates by confidence tier and evidence tier", () => {
    const resolutions: CandidateResolution[] = [
      resolution({ code: "a", posterior: 80, confidence: "high", evidenceTier: "P0-anchored", outcome: 1 }),
      resolution({ code: "b", posterior: 50, confidence: "medium", evidenceTier: "P0-capped", outcome: 0 }),
      resolution({ code: "c", posterior: 50, confidence: "medium", evidenceTier: "P0-capped", outcome: 1 }),
    ];
    const report = buildResolutionCalibration(resolutions, "2026-06-01T01:00:00.000Z");
    const high = report.byConfidenceTier.find((tier) => tier.tier === "high");
    const medium = report.byConfidenceTier.find((tier) => tier.tier === "medium");
    expect(high?.count).toBe(1);
    expect(high?.empiricalHitRate).toBeCloseTo(1, 10);
    expect(medium?.count).toBe(2);
    expect(medium?.empiricalHitRate).toBeCloseTo(0.5, 10);
    const capped = report.byEvidenceTier.find((tier) => tier.tier === "P0-capped");
    expect(capped?.count).toBe(2);
    expect(renderResolutionCalibration(report)).toContain("Brier");
  });

  it("returns an empty-safe report when there are no resolutions", () => {
    const report = buildResolutionCalibration([], "2026-06-01T01:00:00.000Z");
    expect(report.resolved).toBe(0);
    expect(report.brierMean).toBe(0);
    expect(report.reliabilityBins).toEqual([]);
  });
});
