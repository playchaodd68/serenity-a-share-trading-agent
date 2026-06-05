import { describe, expect, it } from "vitest";
import { explainCandidate } from "../src/report.js";
import { scoreCandidate } from "../src/methodology.js";
import { SEED_SOURCES } from "../src/sources/seed.js";
import type { AShareStock, ScreenRun } from "../src/types.js";

describe("report explanations", () => {
  it("explains the latest candidate trace by stock code", () => {
    const stock: AShareStock = {
      code: "300308",
      name: "中际旭创",
      latestPrice: 120,
      pctChange: 2.1,
      totalMarketCap: 130_000_000_000,
      floatMarketCap: 120_000_000_000,
      pe: 42,
      turnover: 3.2,
      mainNetInflow: 10_000_000,
      industry: "通信设备",
      region: "山东板块",
      concept: "CPO 光模块 硅光 AI算力",
    };
    const run: ScreenRun = {
      runId: "screen-test",
      generatedAt: "2026-06-01T00:00:00.000Z",
      candidates: [scoreCandidate(stock, SEED_SOURCES)],
      totalStocksScanned: 1,
      sourceCount: SEED_SOURCES.length,
    };

    const text = explainCandidate(run, "300308");
    expect(text).toContain("中际旭创");
    expect(text).toContain("Prior");
    expect(text).toContain("Industry Logic & Trend");
    expect(text).toContain("Coverage Gaps");
  });
});
