import { describe, expect, it } from "vitest";
import { explainCandidate, renderScreenReport } from "../src/report.js";
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

describe("high-prior evidence-missing block (P0-1)", () => {
  const baseRun: ScreenRun = {
    runId: "screen-test-missing",
    generatedAt: "2026-07-03T00:00:00.000Z",
    candidates: [],
    totalStocksScanned: 3,
    sourceCount: 0,
    hotThemeDowngrades: [],
  };

  it("renders the block as an independent section without seat semantics", () => {
    const run: ScreenRun = {
      ...baseRun,
      evidenceMissingHighPrior: [
        {
          code: "300999",
          name: "缺证样本",
          industry: "光通信",
          priorScore: 27,
          score: 40,
          confidence: "low",
          matchedThemes: ["AI 光互联 / CPO / 硅光"],
        },
      ],
    };
    const text = renderScreenReport(run);
    expect(text).toContain("高先验·证据缺失");
    expect(text).toContain("证据缺失 ≠ 否决");
    expect(text).toContain("补齐证据后再判");
    expect(text).toContain("不占");
    expect(text).toContain("300999 缺证样本");
    expect(text).toContain("AI 光互联 / CPO / 硅光");
  });

  it("renders an explicit empty state and tolerates legacy runs without the field", () => {
    expect(renderScreenReport({ ...baseRun, evidenceMissingHighPrior: [] })).toContain("高先验·证据缺失");
    expect(renderScreenReport(baseRun)).toContain("高先验·证据缺失");
  });
});
