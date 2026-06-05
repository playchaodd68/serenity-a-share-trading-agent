import { describe, expect, it } from "vitest";
import { renderQuantBacktestReport, runQuantBacktest, type QuantBacktestOptions, type QuantBacktestSnapshot } from "../src/quant/backtest.js";

const snapshots = [
  {
    date: "2026-01-03",
    benchmarkReturn: 0.01,
    candidates: [
      { code: "688003", name: "涨停光模块", industry: "AI算力", score: 95, bucket: "core", evidenceGate: "pass", forwardReturn: 0.09, limitUp: true },
      { code: "688001", name: "核心光芯片", industry: "AI算力", score: 90, bucket: "core", evidenceGate: "pass", forwardReturn: 0.06 },
      { code: "688002", name: "核心连接器", industry: "AI算力", score: 84, bucket: "core", evidenceGate: "pass", forwardReturn: 0.04 },
      { code: "300001", name: "先进封装", industry: "半导体", score: 80, bucket: "watchlist", evidenceGate: "pass", forwardReturn: 0.03 },
      { code: "300002", name: "设备材料", industry: "半导体", score: 70, bucket: "watchlist", evidenceGate: "watchlist", forwardReturn: 0.01 },
      { code: "600001", name: "弱证据化工", industry: "化工", score: 52, bucket: "observe", evidenceGate: "fail", forwardReturn: -0.03 },
    ],
  },
  {
    date: "2026-01-10",
    benchmarkReturn: 0.005,
    candidates: [
      { code: "300010", name: "机器人总成", industry: "机器人", score: 92, bucket: "core", evidenceGate: "pass", forwardReturn: 0.04 },
      { code: "300001", name: "先进封装", industry: "半导体", score: 88, bucket: "core", evidenceGate: "pass", forwardReturn: 0.03 },
      { code: "688001", name: "核心光芯片", industry: "AI算力", score: 82, bucket: "core", evidenceGate: "pass", forwardReturn: 0.02 },
      { code: "300011", name: "减速器", industry: "机器人", score: 76, bucket: "watchlist", evidenceGate: "pass", forwardReturn: 0.01 },
      { code: "300002", name: "设备材料", industry: "半导体", score: 64, bucket: "watchlist", evidenceGate: "watchlist", forwardReturn: -0.01 },
      { code: "688002", name: "核心连接器", industry: "AI算力", score: 58, bucket: "watchlist", evidenceGate: "watchlist", forwardReturn: -0.02 },
    ],
  },
  {
    date: "2026-01-17",
    benchmarkReturn: 0,
    candidates: [
      { code: "688010", name: "电力设备龙头", industry: "电力设备", score: 94, bucket: "core", evidenceGate: "pass", forwardReturn: 0.03 },
      { code: "300001", name: "先进封装", industry: "半导体", score: 86, bucket: "core", evidenceGate: "pass", forwardReturn: 0.02 },
      { code: "688001", name: "核心光芯片", industry: "AI算力", score: 78, bucket: "core", evidenceGate: "pass", forwardReturn: 0.01 },
      { code: "688011", name: "电网自动化", industry: "电力设备", score: 75, bucket: "watchlist", evidenceGate: "pass", forwardReturn: 0.015 },
      { code: "300010", name: "机器人总成", industry: "机器人", score: 50, bucket: "observe", evidenceGate: "watchlist", forwardReturn: -0.05, limitDown: true },
      { code: "600002", name: "弱势地产", industry: "地产", score: 30, bucket: "reject", evidenceGate: "fail", forwardReturn: -0.06 },
    ],
  },
] satisfies QuantBacktestSnapshot[];

const options = {
  portfolioSize: 4,
  minScore: 60,
  includeBuckets: ["core", "watchlist"],
  includeEvidenceGates: ["pass", "watchlist"],
  maxIndustryWeight: 0.5,
  transactionCostBps: 15,
  slippageBps: 10,
  periodsPerYear: 52,
} satisfies QuantBacktestOptions;

describe("Serenity quant backtest", () => {
  it("builds an A-share executable portfolio with limit and industry constraints", () => {
    const result = runQuantBacktest(snapshots, options);

    expect(result.periods).toHaveLength(3);
    expect(result.periods[0].selected.map((position) => position.code)).toEqual(["688001", "688002", "300001", "300002"]);
    expect(result.periods[0].blockedBuys.join("\n")).toContain("688003 涨停");
    expect(result.periods[0].turnover).toBeCloseTo(1);
    expect(result.periods[0].tradedWeight).toBeCloseTo(1);
    expect(result.periods[0].costDrag).toBeCloseTo(0.0025);

    const aiWeight = result.periods[0].selected.filter((position) => position.industry === "AI算力").reduce((total, position) => total + position.weight, 0);
    expect(aiWeight).toBeLessThanOrEqual(0.5);

    expect(result.periods[2].selected[0]).toMatchObject({ code: "300010", frozen: true });
    expect(result.periods[2].blockedSells.join("\n")).toContain("300010 跌停");
    expect(result.periods[2].selected.map((position) => position.code)).toEqual(["300010", "688010", "300001", "688001"]);
  });

  it("reports factor validity without adding a crowding penalty", () => {
    const result = runQuantBacktest(snapshots, options);
    const q1 = result.groupReturns.find((group) => group.group === "Q1-high");
    const q5 = result.groupReturns.find((group) => group.group === "Q5-low");
    const averageIc = result.ic.reduce((total, item) => total + (item.rankIc ?? 0), 0) / result.ic.length;

    expect(result.metrics.totalReturn).toBeGreaterThan(result.metrics.benchmarkTotalReturn);
    expect(result.metrics.avgTurnover).toBeGreaterThan(0);
    expect(averageIc).toBeGreaterThan(0.5);
    expect(q1?.averageForwardReturn).toBeGreaterThan(q5?.averageForwardReturn ?? 0);
    expect(result.notes.join("\n")).toContain("不作为拥挤降权");

    const report = renderQuantBacktestReport(result);
    expect(report).toContain("Serenity Mainline Quant Backtest");
    expect(report).toContain("Average rank IC");
    expect(report).toContain("不作为拥挤降权");
  });
});
