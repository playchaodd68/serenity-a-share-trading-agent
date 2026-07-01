import { describe, expect, it } from "vitest";
import { buildKillCriteria, evaluateKillCriteria } from "../src/research/kill-criteria.js";
import type { KillCriteriaInput } from "../src/research/kill-criteria.js";

const base: KillCriteriaInput = {
  matchedThemeLabels: ["AI 光互联 / CPO / 硅光"],
  hasCandidateP0: false,
  expectationGapScore: 4,
  negativeHitSignals: ["客户自研", "价格战"],
  supplyReleaseTerms: [],
  pe: 120,
  entryDate: "2026-05-01T00:00:00.000Z",
};

describe("kill criteria generation", () => {
  it("writes 3-5 dated, machine-checkable falsifiers with negative deltas and source checks", () => {
    const criteria = buildKillCriteria(base);
    expect(criteria.length).toBeGreaterThanOrEqual(3);
    expect(criteria.length).toBeLessThanOrEqual(5);
    const categories = criteria.map((item) => item.category);
    expect(categories).toContain("evidence-gap");
    expect(categories).toContain("expectation-window");
    expect(categories).toContain("supply-release");
    for (const item of criteria) {
      expect(item.dueDate > base.entryDate).toBe(true);
      expect(item.posteriorDelta).toBeLessThan(0);
      expect(item.sourceCheck.length).toBeGreaterThan(0);
    }
  });

  it("omits the evidence-gap falsifier once candidate P0 already exists", () => {
    const criteria = buildKillCriteria({ ...base, hasCandidateP0: true });
    expect(criteria.some((item) => item.category === "evidence-gap")).toBe(false);
  });

  it("adds a valuation falsifier only for expensive names", () => {
    expect(buildKillCriteria({ ...base, pe: 20 }).some((item) => item.category === "valuation")).toBe(false);
    expect(buildKillCriteria(base).some((item) => item.category === "valuation")).toBe(true);
  });
});

describe("kill criteria evaluation", () => {
  it("does not fire any trigger before its due date", () => {
    const criteria = buildKillCriteria(base);
    const evaluation = evaluateKillCriteria(
      criteria,
      { hasCandidateP0: false, activeNegativeSignals: ["客户自研"] },
      "2026-05-10T00:00:00.000Z",
    );
    expect(evaluation.fired).toEqual([]);
    expect(evaluation.pending.length).toBe(criteria.length);
    expect(evaluation.totalDelta).toBe(0);
  });

  it("fires the evidence-gap trigger when overdue and P0 is still missing", () => {
    const criteria = buildKillCriteria(base);
    const evaluation = evaluateKillCriteria(
      criteria,
      { hasCandidateP0: false, activeNegativeSignals: [] },
      "2026-09-01T00:00:00.000Z",
    );
    expect(evaluation.fired.some((item) => item.category === "evidence-gap")).toBe(true);
    expect(evaluation.totalDelta).toBeLessThan(0);
  });

  it("does not fire the evidence-gap trigger once P0 has arrived", () => {
    const criteria = buildKillCriteria(base);
    const evaluation = evaluateKillCriteria(
      criteria,
      { hasCandidateP0: true, activeNegativeSignals: [] },
      "2026-09-01T00:00:00.000Z",
    );
    expect(evaluation.fired.some((item) => item.category === "evidence-gap")).toBe(false);
  });

  it("fires a negative-signal trigger only while the signal stays active", () => {
    const criteria = buildKillCriteria(base);
    const stillActive = evaluateKillCriteria(
      criteria,
      { hasCandidateP0: true, activeNegativeSignals: ["客户自研"] },
      "2026-09-01T00:00:00.000Z",
    );
    expect(stillActive.fired.some((item) => item.category === "negative-signal")).toBe(true);
    const cleared = evaluateKillCriteria(
      criteria,
      { hasCandidateP0: true, activeNegativeSignals: [] },
      "2026-09-01T00:00:00.000Z",
    );
    expect(cleared.fired.some((item) => item.category === "negative-signal")).toBe(false);
  });

  it("routes externally-confirmable overdue triggers to overdue, not fired", () => {
    const criteria = buildKillCriteria(base);
    const evaluation = evaluateKillCriteria(
      criteria,
      { hasCandidateP0: true, activeNegativeSignals: [] },
      "2026-09-01T00:00:00.000Z",
    );
    expect(evaluation.overdue.some((item) => item.category === "supply-release" || item.category === "expectation-window")).toBe(true);
  });
});
