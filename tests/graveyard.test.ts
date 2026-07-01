import { describe, expect, it } from "vitest";
import {
  attachGraveyardOutcomes,
  buryBelowBar,
  combinedBaseRate,
  mergeGraveyard,
  summarizeGraveyard,
} from "../src/research/graveyard.js";
import { scoreCandidate } from "../src/methodology.js";
import type { AShareStock, CandidateResolution, GraveyardEntry } from "../src/types.js";

const optical: AShareStock = {
  code: "000001",
  name: "测试光芯片",
  latestPrice: 10,
  pctChange: 1,
  totalMarketCap: 20_000_000_000,
  floatMarketCap: 10_000_000_000,
  pe: 35,
  turnover: 4,
  mainNetInflow: 1_000_000,
  industry: "光通信",
  region: "测试",
  concept: "CPO 硅光 激光器",
};

function entry(partial: Partial<GraveyardEntry>): GraveyardEntry {
  return {
    code: partial.code ?? "000000",
    name: partial.name ?? "sample",
    reason: partial.reason ?? "below-entry-bar",
    score: partial.score ?? 30,
    confidence: partial.confidence ?? "low",
    matchedThemes: partial.matchedThemes ?? ["光"],
    killedCriterionIds: partial.killedCriterionIds ?? [],
    detail: partial.detail ?? "buried",
    buriedAt: partial.buriedAt ?? "2026-05-01T00:00:00.000Z",
    realizedAlpha: partial.realizedAlpha,
    outcomeLabel: partial.outcomeLabel,
  };
}

function resolution(partial: Partial<CandidateResolution>): CandidateResolution {
  return {
    code: partial.code ?? "000000",
    name: partial.name ?? "sample",
    posterior: partial.posterior ?? 60,
    probability: (partial.posterior ?? 60) / 100,
    confidence: partial.confidence ?? "medium",
    evidenceTier: partial.evidenceTier ?? "P0-capped",
    entryDate: "2026-05-01",
    horizonDays: 20,
    stockReturn: 0,
    benchmarkReturn: 0,
    realizedAlpha: partial.realizedAlpha ?? 0,
    outcome: partial.outcome ?? 1,
    outcomeLabel: partial.outcomeLabel ?? "validated",
    brier: 0,
    resolvedAt: "2026-06-01T00:00:00.000Z",
  };
}

describe("graveyard", () => {
  it("buries candidates that scored below the entry bar with their themes", () => {
    const candidate = scoreCandidate(optical, []);
    const graveyard = buryBelowBar([candidate], 999, "2026-06-01T00:00:00.000Z");
    expect(graveyard).toHaveLength(1);
    expect(graveyard[0].reason).toBe("below-entry-bar");
    expect(graveyard[0].code).toBe("000001");
    expect(graveyard[0].matchedThemes.length).toBeGreaterThan(0);
  });

  it("does not bury candidates at or above the entry bar", () => {
    const candidate = scoreCandidate(optical, []);
    expect(buryBelowBar([candidate], 0, "2026-06-01T00:00:00.000Z")).toHaveLength(0);
  });

  it("upserts by code, keeping the earliest burial and the newest reason", () => {
    const first = entry({ code: "000001", reason: "below-entry-bar", buriedAt: "2026-05-01T00:00:00.000Z" });
    const later = entry({ code: "000001", reason: "kill-triggered", buriedAt: "2026-06-01T00:00:00.000Z", killedCriterionIds: ["kc-evidence-p0"] });
    const merged = mergeGraveyard([first], [later]);
    expect(merged).toHaveLength(1);
    expect(merged[0].reason).toBe("kill-triggered");
    expect(merged[0].buriedAt).toBe("2026-05-01T00:00:00.000Z");
    expect(merged[0].killedCriterionIds).toContain("kc-evidence-p0");
  });

  it("does not let an empty-theme downgrade burial clobber recorded themes", () => {
    const killed = entry({ code: "000001", reason: "kill-triggered", matchedThemes: ["AI 光互联 / CPO / 硅光"], buriedAt: "2026-05-01T00:00:00.000Z" });
    const downgraded = entry({ code: "000001", reason: "downgraded", matchedThemes: [], buriedAt: "2026-06-01T00:00:00.000Z" });
    const merged = mergeGraveyard([killed], [downgraded]);
    expect(merged[0].reason).toBe("downgraded");
    expect(merged[0].matchedThemes).toEqual(["AI 光互联 / CPO / 硅光"]);
  });

  it("backfills realized outcomes from resolutions by code", () => {
    const graveyard = [entry({ code: "000001" })];
    const attached = attachGraveyardOutcomes(graveyard, [resolution({ code: "000001", outcomeLabel: "falsified", realizedAlpha: -0.2 })]);
    expect(attached[0].outcomeLabel).toBe("falsified");
    expect(attached[0].realizedAlpha).toBeCloseTo(-0.2, 10);
  });

  it("computes buried hit rate and exposes survivorship inflation via combinedBaseRate", () => {
    const graveyard = [
      entry({ code: "a", outcomeLabel: "validated", matchedThemes: ["光"] }),
      entry({ code: "b", outcomeLabel: "falsified", matchedThemes: ["光"] }),
      entry({ code: "c", matchedThemes: ["电"] }),
    ];
    const summary = summarizeGraveyard(graveyard);
    expect(summary.total).toBe(3);
    expect(summary.resolvedWithOutcome).toBe(2);
    expect(summary.buriedHitRate).toBeCloseTo(0.5, 10);

    const survivors: CandidateResolution[] = [resolution({ code: "s1", outcome: 1 }), resolution({ code: "s2", outcome: 1 })];
    const combined = combinedBaseRate(survivors, graveyard);
    expect(combined.survivorsOnlyHitRate).toBeCloseTo(1, 10);
    // survivors [1,1] + buried [a=1, b=0] => [1,1,1,0] => 0.75
    expect(combined.hitRate).toBeCloseTo(0.75, 10);
    expect(combined.n).toBe(4);
  });
});
