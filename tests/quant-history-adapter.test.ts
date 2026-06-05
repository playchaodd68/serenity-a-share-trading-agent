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
            noCrowdingPenalty: true,
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
    expect(renderQuantHistoryAdapterReport(result)).toContain("No crowding penalty");
  });
});
