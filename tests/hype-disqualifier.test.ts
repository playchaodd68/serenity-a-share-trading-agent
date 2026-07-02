import { describe, expect, it } from "vitest";
import { assessDisqualifiers, assessHypeRisk, scoreCandidate } from "../src/methodology.js";
import type { AShareStock, SourceRecord } from "../src/types.js";

const baseStock: AShareStock = {
  code: "688100",
  name: "测试光芯片",
  latestPrice: 50,
  pctChange: 1.2,
  totalMarketCap: 30_000_000_000,
  floatMarketCap: 15_000_000_000,
  pe: 45,
  turnover: 2.5,
  mainNetInflow: 5_000_000,
  industry: "光通信",
  region: "测试",
  concept: "CPO 光模块 硅光 光芯片",
};

function source(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    id: "SRC-TEST",
    title: "测试来源",
    tier: "P2",
    sourceType: "social",
    publisher: "test",
    observedAt: "2026-06-01",
    summary: "",
    evidenceTags: ["688100", "测试光芯片", "CPO"],
    ...overrides,
  };
}

describe("hype risk assessment (two-sided crowding)", () => {
  it("stays silent for calm, evidence-backed candidates", () => {
    const p0 = source({ id: "P0-1", tier: "P0", sourceType: "primary", summary: "公告披露 CPO 产能与客户验证", evidenceTags: ["688100", "测试光芯片", "candidate-direct"] });
    const hype = assessHypeRisk(baseStock, [p0]);
    expect(hype.hitSignals).toEqual([]);
    expect(hype.reflexivityFlag).toBe(false);
    expect(hype.penalty).toBe(0);
  });

  it("penalizes text hype signals from sources", () => {
    const hot = source({ id: "P2-HYPE", summary: "该股连板，游资接力，题材炒作情绪高位，已充分定价" });
    const hype = assessHypeRisk(baseStock, [hot]);
    expect(hype.hitSignals.length).toBeGreaterThanOrEqual(3);
    expect(hype.penalty).toBeGreaterThan(0);
  });

  it("flags reflexivity when price surges with only P2 evidence", () => {
    const surging: AShareStock = { ...baseStock, pctChange: 9.8, turnover: 15 };
    const p2Only = source({ id: "P2-SOCIAL", summary: "大V点名看好" });
    const hype = assessHypeRisk(surging, [p2Only]);
    expect(hype.reflexivityFlag).toBe(true);
    expect(hype.penalty).toBeGreaterThanOrEqual(6);
  });

  it("does not flag reflexivity when the same surge is backed by P0/P1", () => {
    const surging: AShareStock = { ...baseStock, pctChange: 9.8, turnover: 15 };
    const p0 = source({ id: "P0-2", tier: "P0", sourceType: "primary", summary: "扩产公告与订单披露", evidenceTags: ["688100", "candidate-direct"] });
    const hype = assessHypeRisk(surging, [p0]);
    expect(hype.reflexivityFlag).toBe(false);
  });
});

describe("disqualifiers (hard veto, uncapped by penalty limits)", () => {
  it("triggers on governance failure terms and caps confidence to low", () => {
    const bad = source({ id: "P0-BAD", tier: "P0", sourceType: "primary", summary: "公司公告：实际控制人被证监会立案调查", evidenceTags: ["688100", "测试光芯片", "candidate-direct"] });
    const corroborate = source({ id: "P1-OK", tier: "P1", sourceType: "broker_report", summary: "研报覆盖 CPO 光模块产业", evidenceTags: ["688100", "broker-report"] });
    const assessment = assessDisqualifiers(baseStock, [bad]);
    expect(assessment.triggered).toBe(true);
    expect(assessment.hitSignals.join("")).toContain("立案调查");

    const candidate = scoreCandidate(baseStock, [bad, corroborate]);
    expect(candidate.confidence).toBe("low");
    expect(candidate.trace.confidenceCeiling).toBe("low");
    expect(candidate.trace.ceilingReasons?.join("\n")).toContain("一票否决");
    expect(candidate.trace.risks.join("\n")).toContain("一票否决");
  });

  it("triggers on ST-style name labels", () => {
    const st: AShareStock = { ...baseStock, name: "*ST测光" };
    const assessment = assessDisqualifiers(st, []);
    expect(assessment.triggered).toBe(true);
  });

  it("stays silent for clean candidates", () => {
    expect(assessDisqualifiers(baseStock, []).triggered).toBe(false);
  });
});

describe("scoreCandidate two-sided integration", () => {
  it("adds a hype penalty component that lowers the posterior", () => {
    const hot = source({ id: "P2-HYPE", summary: "连板 游资接力 题材炒作 情绪高位" });
    const clean = scoreCandidate(baseStock, []);
    const hyped = scoreCandidate(baseStock, [hot]);
    const component = hyped.trace.components.find((item) => item.name === "hype-crowding-penalty");
    expect(component).toBeDefined();
    expect(component!.score).toBeLessThan(0);
    expect(hyped.trace.hypeRisk?.penalty).toBeGreaterThan(0);
    expect(clean.trace.components.find((item) => item.name === "hype-crowding-penalty")?.score).toBe(0);
  });

  it("caps reflexivity-flagged candidates at medium even with a strong score", () => {
    const surging: AShareStock = { ...baseStock, pctChange: 9.9, turnover: 16 };
    const p2Only = source({ id: "P2-SOCIAL", summary: "大V点名 CPO 硅光 光芯片 需求 订单 缺口 产能 涨价" });
    const candidate = scoreCandidate(surging, [p2Only]);
    expect(candidate.trace.hypeRisk?.reflexivityFlag).toBe(true);
    expect(candidate.confidence).not.toBe("high");
    expect(candidate.trace.ceilingReasons?.join("\n")).toContain("反身性");
  });
});
