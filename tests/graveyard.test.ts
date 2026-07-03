import { describe, expect, it } from "vitest";
import {
  attachGraveyardOutcomes,
  buryBelowBar,
  combinedBaseRate,
  isActiveRejectReason,
  mergeGraveyard,
  summarizeGraveyard,
} from "../src/research/graveyard.js";
import { BEAR_GATE_REFUTED_REASON } from "../src/research/debate/bear-case.js";
import { scoreCandidate } from "../src/methodology.js";
import type { AShareStock, Candidate, CandidateResolution, GraveyardEntry } from "../src/types.js";

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
    ...(partial.origin ? { origin: partial.origin } : {}),
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
  it("buries low-confidence themed candidates below the bar as evidence-gap (unread, not refuted)", () => {
    const candidate = scoreCandidate(optical, []);
    const graveyard = buryBelowBar([candidate], 999, "2026-06-01T00:00:00.000Z");
    expect(graveyard).toHaveLength(1);
    expect(graveyard[0].reason).toBe("evidence-gap");
    expect(graveyard[0].code).toBe("000001");
    expect(graveyard[0].matchedThemes.length).toBeGreaterThan(0);
  });

  it("buries medium-confidence candidates below the bar as below-entry-bar (read and passed over)", () => {
    const candidate = { ...scoreCandidate(optical, []), confidence: "medium" as const };
    const graveyard = buryBelowBar([candidate], 999, "2026-06-01T00:00:00.000Z");
    expect(graveyard[0].reason).toBe("below-entry-bar");
  });

  it("does not bury candidates at or above the entry bar", () => {
    const candidate = scoreCandidate(optical, []);
    expect(buryBelowBar([candidate], 0, "2026-06-01T00:00:00.000Z")).toHaveLength(0);
  });

  it("buries a low-confidence disqualifier-vetoed candidate as below-entry-bar (read and refuted), never evidence-gap", () => {
    const base = scoreCandidate(optical, []);
    const candidate: Candidate = {
      ...base,
      confidence: "low",
      trace: { ...base.trace, disqualifiers: { hitSignals: ["立案调查"], triggered: true } },
    };
    const graveyard = buryBelowBar([candidate], 999, "2026-06-01T00:00:00.000Z");
    expect(graveyard).toHaveLength(1);
    expect(graveyard[0].reason).toBe("below-entry-bar");
    expect(graveyard[0].detail).toContain("立案调查");
    expect(graveyard[0].detail).not.toContain("unread, not refuted");
  });

  it("buries a low-confidence bear-refuted candidate as below-entry-bar, never evidence-gap", () => {
    const base = scoreCandidate(optical, []);
    const candidate: Candidate = {
      ...base,
      confidence: "low",
      trace: { ...base.trace, confidenceCeiling: "low", ceilingReasons: [BEAR_GATE_REFUTED_REASON] },
    };
    const graveyard = buryBelowBar([candidate], 999, "2026-06-01T00:00:00.000Z");
    expect(graveyard).toHaveLength(1);
    expect(graveyard[0].reason).toBe("below-entry-bar");
    expect(graveyard[0].detail).toContain("refuted");
    expect(graveyard[0].detail).not.toContain("unread, not refuted");
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

  it("never lets a neutral burial overwrite an active-reject reason", () => {
    for (const activeReason of ["kill-triggered", "downgraded", "manual-reject"] as const) {
      expect(isActiveRejectReason(activeReason)).toBe(true);
      const rejected = entry({ code: "000001", reason: activeReason, detail: "读过并否决", buriedAt: "2026-05-01T00:00:00.000Z" });
      const neutral = entry({
        code: "000001",
        reason: "evidence-gap",
        detail: "unread, not refuted",
        buriedAt: "2026-06-01T00:00:00.000Z",
        outcomeLabel: "falsified",
      });
      const merged = mergeGraveyard([rejected], [neutral]);
      expect(merged).toHaveLength(1);
      expect(merged[0].reason).toBe(activeReason);
      expect(merged[0].detail).toBe("读过并否决");
      // Non-verdict fields still merge normally.
      expect(merged[0].outcomeLabel).toBe("falsified");
      expect(merged[0].buriedAt).toBe("2026-05-01T00:00:00.000Z");
    }
  });

  it("still lets an active reject overwrite a neutral burial", () => {
    const neutral = entry({ code: "000001", reason: "evidence-gap", buriedAt: "2026-05-01T00:00:00.000Z" });
    const rejected = entry({ code: "000001", reason: "manual-reject", detail: "人工否决", buriedAt: "2026-06-01T00:00:00.000Z" });
    const merged = mergeGraveyard([neutral], [rejected]);
    expect(merged[0].reason).toBe("manual-reject");
    expect(merged[0].detail).toBe("人工否决");
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

  it("keeps graveyard-origin resolutions out of the survivor side and never double-counts them", () => {
    // A resolved rejection lives on the ledger with origin:"graveyard" AND has been
    // written back onto its graveyard entry as outcomeLabel.
    const graveyard = [entry({ code: "g1", outcomeLabel: "falsified" })];
    const ledger: CandidateResolution[] = [
      resolution({ code: "g1", origin: "graveyard", outcomeLabel: "falsified", outcome: 0 }),
      resolution({ code: "s1", outcomeLabel: "validated" }),
    ];
    const combined = combinedBaseRate(ledger, graveyard);
    // Survivor hit rate covers watchlist theses only — the rejected g1 must not pollute it.
    expect(combined.survivorsOnlyHitRate).toBeCloseTo(1, 10);
    // g1 counts exactly once (via the graveyard), not twice: [s1=1, g1=0] => n=2, 0.5.
    expect(combined.n).toBe(2);
    expect(combined.hitRate).toBeCloseTo(0.5, 10);
  });
});
