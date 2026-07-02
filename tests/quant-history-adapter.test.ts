import { describe, expect, it } from "vitest";
import {
  adaptScreenRunsToBacktestInput,
  buildQuantBacktestInputFile,
  parseHistoricalPriceCsv,
  renderQuantHistoryAdapterReport,
  type QuantHistoryPriceBar,
} from "../src/quant/history-adapter.js";
import type { Candidate, ScreenRun } from "../src/types.js";

function candidate(input: { code: string; name: string; industry: string; score: number; quantScore?: number; bucket?: "core" | "watchlist" | "observe" | "reject"; evidenceGate?: "pass" | "watchlist" | "fail" }): Candidate {
  return {
    stock: {
      code: input.code,
      name: input.name,
      industry: input.industry,
      latestPrice: 10,
      pctChange: 1,
      totalMarketCap: 10_000_000_000,
      floatMarketCap: 8_000_000_000,
      pe: 30,
      turnover: 3,
      mainNetInflow: 1_000_000,
      region: "测试",
      concept: "AI算力 半导体",
    },
    matchedThemes: [{ themeId: "ai-compute", label: "AI算力", keywords: ["AI算力"] }],
    score: input.score,
    confidence: "high",
    trace: {
      priorScore: input.score,
      posteriorScore: input.score,
      expectedValueScore: input.score,
      components: [],
      evidence: [],
      risks: [],
      coverageGaps: [],
    },
    quant:
      input.quantScore == null
        ? undefined
        : {
            strategy: "Serenity Mainline Quant Overlay",
            generatedAt: "2026-01-02T15:30:00.000Z",
            stockScore: input.quantScore,
            bucket: input.bucket ?? "watchlist",
            evidenceGate: input.evidenceGate ?? "watchlist",
            industry: { industryKey: input.industry, score: 80, tier: "A", components: [], notes: [] },
            components: [],
            technicalConfirmation: { trend: "", volumePrice: "", liquidity: "", marketConsensus: "" },
            warnings: [],
            excludedReasons: [],
            crowdingPolicy: "two-sided",
          },
    generatedAt: "2026-01-02T15:30:00.000Z",
  };
}

function screenRun(generatedAt: string, candidates: Candidate[]): ScreenRun {
  return {
    runId: `screen-${generatedAt}`,
    generatedAt,
    candidates,
    totalStocksScanned: candidates.length,
    sourceCount: 1,
  };
}

describe("quant history adapter", () => {
  it("parses Chinese and English price CSV headers", () => {
    const bars = parseHistoricalPriceCsv(
      [
        "证券代码,交易日期,开盘价,收盘价,后复权收盘,涨跌幅,涨停",
        "688001,20260102,9.8,10,10.5,20,是",
        "300001,2026-01-02,19,20,,0.05,否",
      ].join("\n"),
    );

    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ code: "688001", date: "2026-01-02", close: 10, adjustedClose: 10.5, pctChange: 0.2, limitUp: true });
    expect(bars[1]).toMatchObject({ code: "300001", date: "2026-01-02", close: 20, pctChange: 0.05, limitUp: false });
  });

  it("解析最高价、最低价与成交量表头", () => {
    const bars = parseHistoricalPriceCsv(
      [
        "证券代码,交易日期,开盘价,最高价,最低价,收盘价,成交量",
        "600100,20260102,10,10.5,9.8,10.2,120000",
      ].join("\n"),
    );

    expect(bars[0]).toMatchObject({ code: "600100", high: 10.5, low: 9.8, volume: 120_000 });
  });

  it("adapts historical screen runs into backtest snapshots without crowding fields", () => {
    const oldRun = screenRun("2026-01-02T15:01:00.000Z", [candidate({ code: "688001", name: "旧信号", industry: "AI算力", score: 60 })]);
    const latestRun = screenRun("2026-01-02T15:30:00.000Z", [
      candidate({ code: "688001", name: "核心光芯片", industry: "AI算力", score: 72, quantScore: 88, bucket: "core", evidenceGate: "pass" }),
      candidate({ code: "300001", name: "先进封装", industry: "半导体", score: 70, quantScore: 78, bucket: "watchlist", evidenceGate: "pass" }),
      candidate({ code: "600001", name: "缺行情", industry: "化工", score: 65, quantScore: 68, bucket: "watchlist", evidenceGate: "watchlist" }),
    ]);
    const prices: QuantHistoryPriceBar[] = [
      { code: "688001", date: "2026-01-02", close: 10, adjustedClose: 10, pctChange: 0.02 },
      { code: "688001", date: "2026-01-05", close: 11, adjustedClose: 11, pctChange: 0.1 },
      { code: "688001", date: "2026-01-06", close: 12, adjustedClose: 12, pctChange: 0.09 },
      { code: "300001", date: "2026-01-02", close: 20, adjustedClose: 20, pctChange: 0.2 },
      { code: "300001", date: "2026-01-05", close: 20, adjustedClose: 20, pctChange: 0 },
      { code: "300001", date: "2026-01-06", close: 19, adjustedClose: 19, pctChange: -0.05 },
    ];
    const benchmark: QuantHistoryPriceBar[] = [
      { code: "000300", date: "2026-01-02", close: 100 },
      { code: "000300", date: "2026-01-05", close: 101 },
      { code: "000300", date: "2026-01-06", close: 102 },
    ];

    const result = adaptScreenRunsToBacktestInput([oldRun, latestRun], prices, { horizonBars: 2, entryLagBars: 0 }, benchmark);
    expect(result.snapshots).toHaveLength(1);
    expect(result.coverage.screenRunsUsed).toBe(1);
    expect(result.coverage.candidatesWithForwardReturn).toBe(2);
    expect(result.warnings.join("\n")).toContain("Missing price bars for 600001");

    const snapshot = result.snapshots[0];
    expect(snapshot.date).toBe("2026-01-02");
    expect(snapshot.benchmarkReturn).toBeCloseTo(0.02);
    expect(snapshot.candidates[0]).toMatchObject({ code: "688001", score: 88, bucket: "core", evidenceGate: "pass" });
    expect(snapshot.candidates[0].forwardReturn).toBeCloseTo(0.2);
    expect(snapshot.candidates[1]).toMatchObject({ code: "300001", limitUp: true });
    expect(JSON.stringify(snapshot)).not.toContain("crowding");

    const inputFile = buildQuantBacktestInputFile(result);
    expect(inputFile.options.periodsPerYear).toBe(126);
    expect(renderQuantHistoryAdapterReport(result)).toContain("Two-sided crowding policy");
  });

  it("涨停标志用整数分涨停价精确推断，接近涨停但未封板不再误判", () => {
    const run = screenRun("2026-01-05T15:30:00.000Z", [
      candidate({ code: "600100", name: "接近涨停", industry: "化工", score: 70 }),
      candidate({ code: "600200", name: "精确涨停", industry: "机械", score: 70 }),
    ]);
    const prices: QuantHistoryPriceBar[] = [
      // 主板 10%：昨收 10.00 → 涨停价 11.00；10.98（+9.8%）超过旧阈值 0.098 但未封板
      { code: "600100", date: "2026-01-05", close: 10 },
      { code: "600100", date: "2026-01-06", open: 10.2, high: 10.98, low: 10.1, close: 10.98, pctChange: 0.098 },
      { code: "600100", date: "2026-01-07", close: 11.1 },
      // 昨收 10.00 → 收盘 11.00 精确封板
      { code: "600200", date: "2026-01-05", close: 10 },
      { code: "600200", date: "2026-01-06", open: 10.5, high: 11, low: 10.4, close: 11, pctChange: 0.1 },
      { code: "600200", date: "2026-01-07", close: 11.2 },
    ];

    const result = adaptScreenRunsToBacktestInput([run], prices, { horizonBars: 1, entryLagBars: 1 });
    const byCode = new Map(result.snapshots[0].candidates.map((item) => [item.code, item]));

    expect(byCode.get("600100")).toMatchObject({ limitUp: false });
    expect(byCode.get("600200")).toMatchObject({ limitUp: true });
    // 调仓日 OHLCV 透传给回测层用于一字板/停牌判定
    expect(byCode.get("600200")?.bar).toMatchObject({ open: 10.5, high: 11, low: 10.4, close: 11 });
  });

  it("零成交量且价格无波动的调仓日K线推断为停牌", () => {
    const run = screenRun("2026-01-05T15:30:00.000Z", [candidate({ code: "600300", name: "停牌股", industry: "化工", score: 70 })]);
    const prices: QuantHistoryPriceBar[] = [
      { code: "600300", date: "2026-01-05", close: 10 },
      { code: "600300", date: "2026-01-06", open: 10, high: 10, low: 10, close: 10, volume: 0 },
      { code: "600300", date: "2026-01-07", close: 10.1 },
    ];

    const result = adaptScreenRunsToBacktestInput([run], prices, { horizonBars: 1, entryLagBars: 1 });
    expect(result.snapshots[0].candidates[0]).toMatchObject({ code: "600300", suspended: true, tradable: false });
  });
});
