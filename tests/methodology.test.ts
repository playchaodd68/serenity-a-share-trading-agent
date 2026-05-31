import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import { SEED_SOURCES } from "../src/sources/seed.js";
import type { AShareStock } from "../src/types.js";

describe("methodology scoring", () => {
  it("scores matching bottleneck themes above unrelated companies", () => {
    const optical: AShareStock = {
      code: "000001",
      name: "测试光芯片",
      latestPrice: 10,
      pctChange: 1,
      totalMarketCap: 20_000_000_000,
      floatMarketCap: 10_000_000_000,
      pe: 35,
      turnover: 4,
      mainNetInflow: 1_000_000,
      industry: "光通信",
      region: "测试",
      concept: "CPO 硅光 激光器",
    };
    const bank: AShareStock = {
      ...optical,
      code: "600000",
      name: "测试银行",
      industry: "银行",
      concept: "金融",
      totalMarketCap: 300_000_000_000,
      turnover: 0.2,
      mainNetInflow: -1,
    };
    expect(scoreCandidate(optical, SEED_SOURCES).score).toBeGreaterThan(scoreCandidate(bank, SEED_SOURCES).score);
    expect(scoreCandidate(optical, SEED_SOURCES).matchedThemes[0]?.themeId).toBe("ai-optical-cpo");
  });
});
