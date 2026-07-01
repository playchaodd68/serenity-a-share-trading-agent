import { describe, expect, it } from "vitest";
import {
  assessBacktestOverfitting,
  cscvPbo,
  deflatedSharpe,
  normalCdf,
  normalPpf,
  probabilisticSharpe,
  purgedKFoldIndices,
  renderCscv,
} from "../src/quant/overfitting.js";

describe("normal helpers", () => {
  it("matches known normal CDF/PPF values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 3);
    expect(normalPpf(0.975)).toBeCloseTo(1.959964, 3);
    expect(normalCdf(normalPpf(0.8))).toBeCloseTo(0.8, 4);
  });
});

describe("probabilistic Sharpe ratio", () => {
  it("is 0.5 when the observed Sharpe equals the benchmark", () => {
    expect(probabilisticSharpe(0, 0, 100, 0, 3)).toBeCloseTo(0.5, 6);
  });

  it("rises with more observations for a positive Sharpe", () => {
    const short = probabilisticSharpe(0.15, 0, 50, 0, 3);
    const long = probabilisticSharpe(0.15, 0, 500, 0, 3);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(0.9);
  });
});

describe("deflated Sharpe ratio", () => {
  it("raises the null benchmark and lowers confidence as trials increase", () => {
    const few = deflatedSharpe({ sharpe: 0.2, n: 120, skewness: 0, kurtosis: 3, numTrials: 5, varianceOfTrialSharpe: 0.01 });
    const many = deflatedSharpe({ sharpe: 0.2, n: 120, skewness: 0, kurtosis: 3, numTrials: 500, varianceOfTrialSharpe: 0.01 });
    expect(many.sr0).toBeGreaterThan(few.sr0);
    expect(many.dsr).toBeLessThan(few.dsr);
  });
});

describe("purged K-fold indices", () => {
  it("partitions the sample into contiguous test blocks with an embargoed train set", () => {
    const splits = purgedKFoldIndices(20, 5, 1);
    expect(splits.length).toBe(5);
    const allTest = splits.flatMap((split) => split.test).sort((a, b) => a - b);
    expect(allTest).toEqual(Array.from({ length: 20 }, (_, index) => index));
    for (const split of splits) {
      const testSet = new Set(split.test);
      // train and test never overlap
      expect(split.train.some((index) => testSet.has(index))).toBe(false);
    }
    // embargo removes the neighbor index just outside the test block from train
    const middle = splits[1]; // test [4,8)
    expect(middle.train).not.toContain(3);
    expect(middle.train).not.toContain(8);
    expect(middle.train).toContain(0);
  });

  it("throws on invalid fold counts or a negative embargo", () => {
    expect(() => purgedKFoldIndices(5, 1, 0)).toThrow();
    expect(() => purgedKFoldIndices(3, 5, 0)).toThrow();
    expect(() => purgedKFoldIndices(20, 5, -1)).toThrow();
  });
});

describe("assessBacktestOverfitting", () => {
  it("summarizes per-period Sharpe, PSR, and a multiple-testing-corrected verdict", () => {
    const returns = [0.02, -0.01, 0.03, 0.01, -0.005, 0.025, 0.015, -0.02, 0.03, 0.005, 0.01, 0.02];
    const guard = assessBacktestOverfitting(returns, 50);
    expect(guard.periods).toBe(12);
    expect(guard.numTrials).toBe(50);
    expect(guard.perPeriodSharpe).toBeGreaterThan(0);
    expect(guard.psrPositive).toBeGreaterThan(0);
    expect(guard.psrPositive).toBeLessThanOrEqual(1);
    expect(typeof guard.deflatedSharpe.dsr).toBe("number");
    expect(guard.passes).toBe(guard.deflatedSharpe.dsr >= guard.threshold);
  });

  it("fails the gate when many trials chase a weak edge", () => {
    const weak = [0.001, -0.002, 0.003, -0.001, 0.002, -0.0015, 0.0005, 0.001, -0.001, 0.0012];
    const guard = assessBacktestOverfitting(weak, 2000);
    expect(guard.passes).toBe(false);
  });
});

describe("CSCV / PBO", () => {
  it("validates the matrix and block count", () => {
    const matrix = [
      [1, 2, 3, 4, 5, 6, 7, 8],
      [8, 7, 6, 5, 4, 3, 2, 1],
    ];
    expect(() => cscvPbo(matrix, { blocks: 3 })).toThrow(); // odd
    expect(() => cscvPbo(matrix, { blocks: 10 })).toThrow(); // > periods
    expect(() => cscvPbo([[1, 2, 3, 4]], { blocks: 2 })).toThrow(); // < 2 configs
    expect(() => cscvPbo([[1, 2, 3, 4], [1, 2, 3]], { blocks: 2 })).toThrow(); // ragged
  });

  it("reports zero overfitting when one config dominates every period", () => {
    const periods = 8;
    const dominant = Array.from({ length: periods }, () => 3);
    const weak = Array.from({ length: periods }, () => 1);
    const weaker = Array.from({ length: periods }, () => 0.5);
    const result = cscvPbo([dominant, weak, weaker], { blocks: 4 });
    expect(result.nConfigs).toBe(3);
    expect(result.nBlocks).toBe(4);
    expect(result.nCombinations).toBe(6); // C(4,2)
    expect(result.logits.length).toBe(6);
    expect(result.pbo).toBe(0);
  });

  it("detects overfitting when the in-sample winner flips out-of-sample", () => {
    const a = [2, 2, 2, 2, -2, -2, -2, -2];
    const b = [-2, -2, -2, -2, 2, 2, 2, 2];
    const result = cscvPbo([a, b], { blocks: 4 });
    expect(result.pbo).toBeGreaterThan(0);
    expect(renderCscv(result)).toContain("PBO");
  });

  it("keeps pbo and probabilityOfLoss within [0,1]", () => {
    const matrix = [
      [1, 2, 1, 2, 1, 2, 1, 2],
      [2, 1, 2, 1, 2, 1, 2, 1],
      [0, 0, 1, 1, 0, 0, 1, 1],
    ];
    const result = cscvPbo(matrix, { blocks: 4 });
    expect(result.pbo).toBeGreaterThanOrEqual(0);
    expect(result.pbo).toBeLessThanOrEqual(1);
    expect(result.probabilityOfLoss).toBeGreaterThanOrEqual(0);
    expect(result.probabilityOfLoss).toBeLessThanOrEqual(1);
  });
});
