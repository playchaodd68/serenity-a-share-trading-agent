import { describe, expect, it } from "vitest";
import { assessIndustryLogic, methodologySummary, relevantSourcesForCandidate, scoreCandidate } from "../src/methodology.js";
import { SEED_SOURCES } from "../src/sources/seed.js";
import type { AShareStock, SourceRecord } from "../src/types.js";

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

  it("does not treat generic P0 registries as candidate-level evidence", () => {
    const optical: AShareStock = {
      code: "300308",
      name: "中际旭创",
      latestPrice: 120,
      pctChange: 2.1,
      totalMarketCap: 20_000_000_000,
      floatMarketCap: 10_000_000_000,
      pe: 35,
      turnover: 4,
      mainNetInflow: 1_000_000,
      industry: "通信设备",
      region: "山东板块",
      concept: "CPO 光模块 硅光 激光器",
    };
    const candidate = scoreCandidate(optical, SEED_SOURCES);
    expect(candidate.confidence).not.toBe("high");
    expect(candidate.trace.coverageGaps.join("\n")).toContain("候选级 P0");
    expect(relevantSourcesForCandidate(optical, SEED_SOURCES).some((source) => source.tier === "P0")).toBe(false);
  });

  it("allows high confidence only when candidate-specific P0 is corroborated", () => {
    const stock: AShareStock = {
      code: "688999",
      name: "测试硅光",
      latestPrice: 18,
      pctChange: 2,
      totalMarketCap: 20_000_000_000,
      floatMarketCap: 12_000_000_000,
      pe: 35,
      turnover: 4,
      mainNetInflow: 1_000_000,
      industry: "光通信",
      region: "测试",
      concept: "CPO 光模块 硅光 激光器 光芯片",
    };
    const p0: SourceRecord = {
      id: "P0-688999-ANNUAL",
      title: "688999 测试硅光 2025 年报",
      tier: "P0",
      sourceType: "primary",
      publisher: "CNINFO",
      observedAt: "2026-06-01",
      summary: "测试硅光披露 CPO、硅光、激光器客户验证与产能建设，订单、需求、供给缺口、价格、毛利、净利和 Q2 业绩兑现。",
      evidenceTags: ["688999", "测试硅光", "CPO", "硅光", "candidate-direct"],
    };
    const p1: SourceRecord = {
      id: "P1-688999-BROKER",
      title: "测试硅光 CPO 产业链研报",
      tier: "P1",
      sourceType: "broker_report",
      publisher: "Licensed local report inbox",
      observedAt: "2026-06-01",
      summary: "卖方研报交叉验证测试硅光 CPO 光模块和硅光激光器扩产，客户导入、认证、放量、单价和利润弹性形成超预期。",
      evidenceTags: ["688999", "CPO", "硅光", "broker-report"],
    };

    const candidate = scoreCandidate(stock, [...SEED_SOURCES, p0, p1]);
    expect(candidate.confidence).toBe("high");
    expect(candidate.trace.components.find((item) => item.name === "source-quality")?.sourceIds).toContain("P0-688999-ANNUAL");
    expect(candidate.trace.industryLogic?.missingSignals).toEqual([]);
  });

  it("assesses industry logic before market confirmation", () => {
    const stock: AShareStock = {
      code: "688999",
      name: "测试硅光",
      latestPrice: 18,
      pctChange: -2,
      totalMarketCap: 200_000_000_000,
      floatMarketCap: 120_000_000_000,
      pe: 120,
      turnover: 0.3,
      mainNetInflow: -1_000_000,
      industry: "光通信",
      region: "测试",
      concept: "AI算力 CPO 光模块 硅光 InP 光芯片 MPO 测试设备",
    };

    const logic = assessIndustryLogic(stock, []);
    const candidate = scoreCandidate(stock, []);
    expect(logic.primaryTrendScore).toBeGreaterThan(15);
    expect(logic.bottleneckDepthScore).toBeGreaterThan(10);
    expect(candidate.trace.components[0].name).toBe("industry-trend-primacy");
    expect(candidate.trace.components.find((item) => item.name === "market-confirmation")?.maxScore).toBe(5);
  });

  it("documents distilled reasoning boundaries and limitations", () => {
    const summary = methodologySummary();
    expect(summary).toContain("SERENITY-REPLY-DISTILLATION-20260530");
    expect(summary).toContain("推理出处分层");
    expect(summary).toContain("框架推断，不是结论");
    expect(summary).toContain("趋势优先产业排序框架");
    expect(summary).toContain("需求量 -> 供给量 -> 缺口 -> 价格 -> 单位利润 -> 公司弹性");
    expect(summary).toContain("估值纪律");
    expect(summary).toContain("幸存者偏差");
    expect(summary).toContain("不得以第一人称扮演 Serenity");
  });

  it("does not let distillation sources satisfy candidate primary evidence", () => {
    const optical: AShareStock = {
      code: "300308",
      name: "中际旭创",
      latestPrice: 120,
      pctChange: 2.1,
      totalMarketCap: 20_000_000_000,
      floatMarketCap: 10_000_000_000,
      pe: 35,
      turnover: 4,
      mainNetInflow: 1_000_000,
      industry: "通信设备",
      region: "山东板块",
      concept: "CPO 光模块 硅光 激光器",
    };
    const relevantIds = relevantSourcesForCandidate(optical, SEED_SOURCES).map((source) => source.id);
    expect(relevantIds).not.toContain("SERENITY-REPLY-DISTILLATION-20260530");
    expect(relevantIds).not.toContain("SERENITY-REPLY-EVALS-20260530");
    expect(scoreCandidate(optical, SEED_SOURCES).confidence).not.toBe("high");
  });

  it("excludes Serenity social/thesis sources from candidate-relevant clues even when keywords match", () => {
    const optical: AShareStock = {
      code: "300308",
      name: "中际旭创",
      latestPrice: 120,
      pctChange: 2.1,
      totalMarketCap: 20_000_000_000,
      floatMarketCap: 10_000_000_000,
      pe: 35,
      turnover: 4,
      mainNetInflow: 1_000_000,
      industry: "通信设备",
      region: "山东板块",
      concept: "CPO 光模块 硅光 激光器",
    };
    const relevantIds = relevantSourcesForCandidate(optical, SEED_SOURCES).map((source) => source.id);
    expect(relevantIds).not.toContain("SERENITY-X-ARTICLE-SIVE-20260519");
    expect(relevantIds).not.toContain("SERENITY-ALEABITOREDDIT-ARCHIVE-20260611");
    expect(relevantIds.every((id) => !/^SERENITY[-_]/i.test(id))).toBe(true);
  });

  it("documents the cross-market A-share mapping framework", () => {
    const summary = methodologySummary();
    expect(summary).toContain("跨市场卡点映射框架");
    expect(summary).toContain("line of inquiry");
    expect(summary).toContain("SERENITY-ALEABITOREDDIT-ARCHIVE-20260611");
    expect(summary).toContain("domestic-substitution-play");
  });
});
