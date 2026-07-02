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

  it("reports factor validity with the two-sided crowding note", () => {
    const result = runQuantBacktest(snapshots, options);
    const q1 = result.groupReturns.find((group) => group.group === "Q1-high");
    const q5 = result.groupReturns.find((group) => group.group === "Q5-low");
    const averageIc = result.ic.reduce((total, item) => total + (item.rankIc ?? 0), 0) / result.ic.length;

    expect(result.metrics.totalReturn).toBeGreaterThan(result.metrics.benchmarkTotalReturn);
    expect(result.metrics.avgTurnover).toBeGreaterThan(0);
    expect(averageIc).toBeGreaterThan(0.5);
    expect(q1?.averageForwardReturn).toBeGreaterThan(q5?.averageForwardReturn ?? 0);
    expect(result.notes.join("\n")).toContain("双向计价");

    const report = renderQuantBacktestReport(result);
    expect(report).toContain("Serenity Mainline Quant Backtest");
    expect(report).toContain("Average rank IC");
    expect(report).toContain("双向计价");
  });

  it("attaches a multiple-testing overfitting guard only when trials are supplied", () => {
    const withoutTrials = runQuantBacktest(snapshots, options);
    expect(withoutTrials.overfitting).toBeUndefined();

    const withTrials = runQuantBacktest(snapshots, { ...options, trials: 200 });
    expect(withTrials.overfitting).toBeDefined();
    expect(withTrials.overfitting!.numTrials).toBe(200);
    expect(typeof withTrials.overfitting!.passes).toBe("boolean");
    expect(renderQuantBacktestReport(withTrials)).toContain("Overfitting guard");
  });
});

describe("A股撮合执行约束", () => {
  const executionOptions = {
    portfolioSize: 2,
    minScore: 0,
    maxIndustryWeight: 1,
    transactionCostBps: 0,
    slippageBps: 0,
  } satisfies QuantBacktestOptions;

  it("一字涨停当日禁止买入，涨停开板（非一字）当日允许买入", () => {
    const result = runQuantBacktest(
      [
        {
          date: "2026-02-06",
          benchmarkReturn: 0,
          candidates: [
            { code: "300100", name: "一字涨停", industry: "AI算力", score: 95, forwardReturn: 0.1, limitUp: true, bar: { open: 12, high: 12, low: 12, close: 12, volume: 1_000 } },
            { code: "300101", name: "涨停开板", industry: "AI算力", score: 90, forwardReturn: 0.05, limitUp: true, bar: { open: 10.8, high: 12, low: 10.5, close: 12, volume: 50_000 } },
            { code: "600100", name: "普通标的", industry: "化工", score: 80, forwardReturn: 0.02 },
          ],
        },
      ],
      executionOptions,
    );

    expect(result.periods[0].selected.map((position) => position.code)).toEqual(["300101", "600100"]);
    expect(result.periods[0].blockedBuys.join("\n")).toContain("300100 涨停");
    expect(result.executionStats.buyBlockedOnePriceLimitUp).toBe(1);
  });

  it("缺少K线信息时涨停标志保守禁止新买入", () => {
    const result = runQuantBacktest(
      [
        {
          date: "2026-02-06",
          benchmarkReturn: 0,
          candidates: [
            { code: "300100", name: "涨停无K线", industry: "AI算力", score: 95, forwardReturn: 0.1, limitUp: true },
            { code: "600100", name: "普通标的", industry: "化工", score: 80, forwardReturn: 0.02 },
          ],
        },
      ],
      { ...executionOptions, portfolioSize: 1 },
    );

    expect(result.periods[0].selected.map((position) => position.code)).toEqual(["600100"]);
    expect(result.executionStats.buyBlockedOnePriceLimitUp).toBe(1);
  });

  it("一字跌停卖出受阻顺延至次一可成交日并占用组合槽位", () => {
    const result = runQuantBacktest(
      [
        {
          date: "2026-02-06",
          benchmarkReturn: 0,
          candidates: [{ code: "600100", name: "持仓A", industry: "化工", score: 90, forwardReturn: 0.01 }],
        },
        {
          date: "2026-02-13",
          benchmarkReturn: 0,
          candidates: [
            { code: "600100", name: "持仓A", industry: "化工", score: 10, forwardReturn: -0.1, limitDown: true, bar: { open: 9, high: 9, low: 9, close: 9, volume: 500 } },
            { code: "600200", name: "替补B", industry: "机械", score: 95, forwardReturn: 0.03 },
          ],
        },
        {
          date: "2026-02-20",
          benchmarkReturn: 0,
          candidates: [
            { code: "600100", name: "持仓A", industry: "化工", score: 10, forwardReturn: -0.02 },
            { code: "600200", name: "替补B", industry: "机械", score: 95, forwardReturn: 0.03 },
          ],
        },
      ],
      { ...executionOptions, portfolioSize: 1 },
    );

    // 跌停日：A 冻结沿用权重，占满唯一槽位，B 无法替补买入
    expect(result.periods[1].selected.map((position) => position.code)).toEqual(["600100"]);
    expect(result.periods[1].selected[0]).toMatchObject({ frozen: true, blockedExitDays: 1 });
    expect(result.periods[1].blockedSells.join("\n")).toContain("600100 跌停");
    // 次一可成交日：A 顺延卖出，B 正常入选
    expect(result.periods[2].selected.map((position) => position.code)).toEqual(["600200"]);
    expect(result.executionStats.sellBlockedOnePriceLimitDown).toBe(1);
    expect(result.executionStats.pendingExits).toBe(1);
    expect(result.executionStats.blockedExitDays).toBe(1);
  });

  it("跌停但盘中开板（非一字）当日可以卖出", () => {
    const result = runQuantBacktest(
      [
        {
          date: "2026-02-06",
          benchmarkReturn: 0,
          candidates: [{ code: "600100", name: "持仓A", industry: "化工", score: 90, forwardReturn: 0.01 }],
        },
        {
          date: "2026-02-13",
          benchmarkReturn: 0,
          candidates: [
            { code: "600100", name: "持仓A", industry: "化工", score: 10, forwardReturn: -0.1, limitDown: true, bar: { open: 9.6, high: 9.9, low: 9, close: 9, volume: 30_000 } },
            { code: "600200", name: "替补B", industry: "机械", score: 95, forwardReturn: 0.03 },
          ],
        },
      ],
      { ...executionOptions, portfolioSize: 1 },
    );

    expect(result.periods[1].selected.map((position) => position.code)).toEqual(["600200"]);
    expect(result.periods[1].blockedSells).toEqual([]);
    expect(result.executionStats.sellBlockedOnePriceLimitDown).toBe(0);
  });

  it("停牌持仓由K线推断冻结并累计受阻天数直至复牌", () => {
    const suspendedBar = { open: 10, high: 10, low: 10, close: 10, volume: 0 };
    const result = runQuantBacktest(
      [
        {
          date: "2026-02-06",
          benchmarkReturn: 0,
          candidates: [{ code: "600100", name: "持仓A", industry: "化工", score: 90, forwardReturn: 0 }],
        },
        {
          date: "2026-02-13",
          benchmarkReturn: 0,
          candidates: [
            { code: "600100", name: "持仓A", industry: "化工", score: 10, forwardReturn: 0, bar: suspendedBar },
            { code: "600200", name: "替补B", industry: "机械", score: 95, forwardReturn: 0.03 },
          ],
        },
        {
          date: "2026-02-20",
          benchmarkReturn: 0,
          candidates: [
            { code: "600100", name: "持仓A", industry: "化工", score: 10, forwardReturn: 0, bar: suspendedBar },
            { code: "600200", name: "替补B", industry: "机械", score: 95, forwardReturn: 0.03 },
          ],
        },
        {
          date: "2026-02-27",
          benchmarkReturn: 0,
          candidates: [
            { code: "600100", name: "持仓A", industry: "化工", score: 10, forwardReturn: -0.02 },
            { code: "600200", name: "替补B", industry: "机械", score: 95, forwardReturn: 0.03 },
          ],
        },
      ],
      { ...executionOptions, portfolioSize: 1 },
    );

    expect(result.periods[1].selected[0]).toMatchObject({ code: "600100", frozen: true, blockedExitDays: 1 });
    expect(result.periods[2].selected[0]).toMatchObject({ code: "600100", frozen: true, blockedExitDays: 2 });
    expect(result.periods[3].selected.map((position) => position.code)).toEqual(["600200"]);
    expect(result.executionStats.sellBlockedSuspended).toBe(2);
    expect(result.executionStats.pendingExits).toBe(1);
    expect(result.executionStats.blockedExitDays).toBe(2);
  });
});
