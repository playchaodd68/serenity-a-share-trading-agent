import { describe, expect, it } from "vitest";
import { computeSycophancySlices, renderSycophancySlices } from "../src/research/sycophancy-slice.js";
import type { CandidateResolution } from "../src/types.js";

function resolution(code: string, probability: number, outcome: 0 | 1): CandidateResolution {
  return {
    code,
    name: `股票${code}`,
    posterior: probability * 100,
    probability,
    confidence: "medium",
    evidenceTier: "P0-anchored",
    entryDate: "2026-01-01T00:00:00.000Z",
    horizonDays: 60,
    stockReturn: outcome === 1 ? 0.2 : -0.1,
    benchmarkReturn: 0.02,
    realizedAlpha: outcome === 1 ? 0.18 : -0.12,
    outcome,
    outcomeLabel: outcome === 1 ? "validated" : "falsified",
    brier: (probability - outcome) ** 2,
    resolvedAt: "2026-06-01T00:00:00.000Z",
  };
}

const NOW = "2026-07-02T00:00:00.000Z";

describe("sycophancy slices (portfolio-related vs unrelated calibration)", () => {
  it("reports insufficient data below the minimum slice size", () => {
    const report = computeSycophancySlices([resolution("300308", 0.7, 1)], new Set(["300308"]), NOW);
    expect(report.verdict).toBe("insufficient-data");
    expect(report.probabilityGap).toBeNull();
  });

  it("raises a sycophancy warning when related calls are more optimistic without more hits", () => {
    const related = ["300301", "300302", "300303", "300304", "300305"].map((code, index) =>
      resolution(code, 0.8, index < 2 ? 1 : 0),
    );
    const unrelated = ["600601", "600602", "600603", "600604", "600605"].map((code, index) =>
      resolution(code, 0.55, index < 2 ? 1 : 0),
    );
    const report = computeSycophancySlices([...related, ...unrelated], new Set(related.map((item) => item.code)), NOW);
    expect(report.verdict).toBe("sycophancy-warning");
    expect(report.probabilityGap).toBeGreaterThan(0.05);
    expect(report.hitRateGap).toBe(0);
    expect(report.detail).toContain("谄媚警告");
  });

  it("stays quiet when higher optimism is matched by higher hit rate", () => {
    const related = ["300301", "300302", "300303", "300304", "300305"].map((code, index) =>
      resolution(code, 0.8, index < 4 ? 1 : 0),
    );
    const unrelated = ["600601", "600602", "600603", "600604", "600605"].map((code, index) =>
      resolution(code, 0.55, index < 2 ? 1 : 0),
    );
    const report = computeSycophancySlices([...related, ...unrelated], new Set(related.map((item) => item.code)), NOW);
    expect(report.verdict).toBe("no-sycophancy-signal");
  });

  it("renders both slices and the verdict", () => {
    const related = ["300301", "300302", "300303", "300304", "300305"].map((code) => resolution(code, 0.8, 0));
    const unrelated = ["600601", "600602", "600603", "600604", "600605"].map((code) => resolution(code, 0.5, 1));
    const rendered = renderSycophancySlices(
      computeSycophancySlices([...related, ...unrelated], new Set(related.map((item) => item.code)), NOW),
    );
    expect(rendered).toContain("portfolio-related");
    expect(rendered).toContain("unrelated");
    expect(rendered).toContain("判定");
  });
});
