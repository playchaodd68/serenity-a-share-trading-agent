import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import {
  buildReflection,
  pendingEntriesFromRun,
  resolveDecisionEntries,
  summarizeDecisionLog,
  type DecisionLogEntry,
} from "../src/research/decision-log.js";
import type { AShareStock, CandidateResolution, ScreenRun } from "../src/types.js";

const stock: AShareStock = {
  code: "688072",
  name: "测试设备",
  latestPrice: 180,
  pctChange: 2,
  totalMarketCap: 48_000_000_000,
  floatMarketCap: 22_000_000_000,
  pe: 75,
  turnover: 4,
  mainNetInflow: 8_000_000,
  industry: "半导体设备",
  region: "测试",
  concept: "半导体 刻蚀 先进封装 国产替代",
};

function makeRun(runId = "screen-1"): ScreenRun {
  return {
    runId,
    generatedAt: "2026-07-01T00:00:00.000Z",
    candidates: [scoreCandidate(stock, [])],
    totalStocksScanned: 1,
    sourceCount: 0,
  };
}

function resolution(overrides: Partial<CandidateResolution> = {}): CandidateResolution {
  return {
    code: "688072",
    name: "测试设备",
    posterior: 55,
    probability: 0.55,
    confidence: "medium",
    evidenceTier: "P0-capped",
    entryDate: "2026-07-01T00:00:00.000Z",
    horizonDays: 60,
    stockReturn: 0.15,
    benchmarkReturn: 0.03,
    realizedAlpha: 0.12,
    outcome: 1,
    outcomeLabel: "validated",
    brier: 0.2,
    resolvedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("decision log (pending -> resolved + reflection)", () => {
  it("registers pending entries from a screen run with clamped probability", () => {
    const additions = pendingEntriesFromRun(makeRun(), []);
    expect(additions).toHaveLength(1);
    expect(additions[0].status).toBe("pending");
    expect(additions[0].probability).toBeGreaterThanOrEqual(0.05);
    expect(additions[0].probability).toBeLessThanOrEqual(0.95);
  });

  it("is idempotent per runId+code", () => {
    const first = pendingEntriesFromRun(makeRun(), []);
    const second = pendingEntriesFromRun(makeRun(), first);
    expect(second).toHaveLength(0);
    const differentRun = pendingEntriesFromRun(makeRun("screen-2"), first);
    expect(differentRun).toHaveLength(1);
  });

  it("resolves pending entries against realized outcomes and writes a reflection", () => {
    const pending = pendingEntriesFromRun(makeRun(), []);
    const { entries, resolvedCount } = resolveDecisionEntries(pending, [resolution()]);
    expect(resolvedCount).toBe(1);
    expect(entries[0].status).toBe("resolved");
    expect(entries[0].realizedAlpha).toBeCloseTo(0.12);
    expect(entries[0].reflection).toContain("验证");
    expect(entries[0].reflection).toContain("alpha");
  });

  it("does not resolve entries decided after the resolution's entry date", () => {
    const pending: DecisionLogEntry[] = [
      {
        id: "screen-9:688072",
        code: "688072",
        name: "测试设备",
        runId: "screen-9",
        decidedAt: "2026-10-01T00:00:00.000Z",
        score: 50,
        confidence: "medium",
        probability: 0.5,
        status: "pending",
      },
    ];
    const { resolvedCount } = resolveDecisionEntries(pending, [resolution()]);
    expect(resolvedCount).toBe(0);
  });

  it("reflection calls out miscalibrated high-confidence misses", () => {
    const entry: DecisionLogEntry = {
      id: "screen-1:688072",
      code: "688072",
      name: "测试设备",
      runId: "screen-1",
      decidedAt: "2026-07-01T00:00:00.000Z",
      score: 80,
      confidence: "high",
      probability: 0.8,
      status: "pending",
    };
    const text = buildReflection(entry, resolution({ outcome: 0, outcomeLabel: "falsified", realizedAlpha: -0.2, brier: 0.64 }));
    expect(text).toContain("高置信但落空");
  });

  it("summarizes totals and validated rate", () => {
    const pending = pendingEntriesFromRun(makeRun(), []);
    const { entries } = resolveDecisionEntries(pending, [resolution()]);
    const summary = summarizeDecisionLog(entries);
    expect(summary).toEqual({ total: 1, pending: 0, resolved: 1, validatedRate: 1 });
  });
});
