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
      // P0-3 后瓶颈/供需/预期差词只由 source 证据文本触发，年报摘要需自带卡点证据。
      summary: "测试硅光披露 CPO、硅光、激光器与光芯片良率爬坡、测试设备认证通过，客户验证与产能建设，订单、需求、供给缺口、价格、毛利、净利和 Q2 业绩兑现。",
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
    // P0-3：无 source 时瓶颈深度只剩主题存在加成（+2），概念标签不再自送瓶颈词分。
    expect(logic.bottleneckDepthScore).toBe(2);
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

  it("wires per-theme negativeSignals into an active posterior penalty", () => {
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
    const bearSource: SourceRecord = {
      id: "P2-CPO-BEAR",
      title: "CPO 空头观点",
      tier: "P2",
      sourceType: "social",
      publisher: "X",
      observedAt: "2026-06-01",
      summary: "有观点认为 CPO 面临客户自研和价格战风险，且铜互连延寿。",
      evidenceTags: ["CPO", "客户自研", "价格战"],
    };

    const clean = scoreCandidate(optical, []);
    const bear = scoreCandidate(optical, [bearSource]);

    const cleanPenalty = clean.trace.components.find((item) => item.name === "negative-signal-penalty");
    const bearPenalty = bear.trace.components.find((item) => item.name === "negative-signal-penalty");
    expect(cleanPenalty?.score).toBe(0);
    expect(bearPenalty).toBeDefined();
    expect(bearPenalty!.score).toBeLessThan(0);
    expect(bear.trace.posteriorScore).toBeLessThan(clean.trace.posteriorScore);
    expect(bear.score).toBeLessThan(clean.score);
    expect(bear.trace.evidence.some((item) => item.title === "negative-signal-penalty" && item.polarity === "negative")).toBe(true);
    expect(clean.trace.components[0].name).toBe("industry-trend-primacy");
  });

  it("adds a capital-cycle supply-side penalty that lowers posterior on capacity-release signals", () => {
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
    const glut: SourceRecord = {
      id: "P2-SUPPLY-GLUT",
      title: "CPO 供给侧观察",
      tier: "P2",
      sourceType: "social",
      publisher: "X",
      observedAt: "2026-06-01",
      summary: "行业出现产能过剩和大幅扩产，新进入者涌入，供给释放。",
      evidenceTags: ["CPO", "产能过剩", "大幅扩产"],
    };

    const clean = scoreCandidate(optical, []);
    const withGlut = scoreCandidate(optical, [glut]);
    const component = withGlut.trace.components.find((item) => item.name === "capital-cycle-supply");
    expect(component).toBeDefined();
    expect(component!.score).toBeLessThan(0);
    expect(clean.trace.components.find((item) => item.name === "capital-cycle-supply")?.score).toBe(0);
    expect(withGlut.trace.posteriorScore).toBeLessThan(clean.trace.posteriorScore);
    expect((withGlut.trace.supplyReleaseSignals ?? []).length).toBeGreaterThan(0);
  });

  it("attaches dated ex-ante kill criteria to every candidate", () => {
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
    const candidate = scoreCandidate(optical, []);
    const criteria = candidate.trace.killCriteria ?? [];
    expect(criteria.length).toBeGreaterThanOrEqual(3);
    expect(criteria.every((item) => item.dueDate > candidate.generatedAt)).toBe(true);
    expect(criteria.some((item) => item.category === "supply-release")).toBe(true);
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
});

describe("evidence tri-state and theme-keyword self-loop (P0-1/P0-3)", () => {
  // concept 里的词同时是主题关键词和瓶颈词（光芯片/硅光/激光器），用来证明自循环已拆除。
  const themed: AShareStock = {
    code: "000010",
    name: "测试样本",
    latestPrice: 10,
    pctChange: 1,
    totalMarketCap: 20_000_000_000,
    floatMarketCap: 10_000_000_000,
    pe: 35,
    turnover: 4,
    mainNetInflow: 1_000_000,
    industry: "光通信",
    region: "测试",
    concept: "CPO 硅光 激光器 光芯片",
  };

  it("does not score bottleneckDepth from theme keywords or stock tags without sources (P0-3)", () => {
    const logic = assessIndustryLogic(themed, []);
    expect(logic.bottleneckDepthScore).toBe(2);
    expect(logic.supplyDemandProfitScore).toBe(0);
    expect(logic.expectationGapScore).toBe(0);
  });

  it("lets real source evidence text trigger bottleneckDepth", () => {
    const src: SourceRecord = {
      id: "P1-000010-EVIDENCE",
      title: "测试样本 卡点研报",
      tier: "P1",
      sourceType: "broker_report",
      publisher: "test",
      observedAt: "2026-07-01",
      summary: "000010 测试样本 光芯片良率与测试设备认证是核心卡点。",
      evidenceTags: ["000010", "测试样本", "candidate-direct"],
    };
    const logic = assessIndustryLogic(themed, [src]);
    expect(logic.bottleneckDepthScore).toBeGreaterThan(2);
  });

  it("marks candidates without any relevant source as evidence-missing, not low-scored negatives", () => {
    const candidate = scoreCandidate(themed, []);
    expect(candidate.trace.evidenceStatus).toBe("missing");
    for (const name of ["supply-demand-profit-elasticity", "expectation-gap-validation-window", "source-quality"]) {
      const component = candidate.trace.components.find((item) => item.name === name);
      expect(component?.reason).toContain("证据缺失(非负面)");
    }
  });

  it("marks candidates with any relevant source as covered", () => {
    const direct: SourceRecord = {
      id: "P1-000010-DIRECT",
      title: "测试样本 定点点评",
      tier: "P1",
      sourceType: "broker_report",
      publisher: "test",
      observedAt: "2026-07-01",
      summary: "000010 测试样本 光模块订单",
      evidenceTags: ["000010", "测试样本", "candidate-direct"],
    };
    const candidate = scoreCandidate(themed, [direct]);
    expect(candidate.trace.evidenceStatus).toBe("covered");
    const quality = candidate.trace.components.find((item) => item.name === "source-quality");
    expect(quality?.reason).not.toContain("证据缺失");
  });
});
