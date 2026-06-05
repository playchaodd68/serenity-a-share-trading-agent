import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import { applySerenityQuantOverlay } from "../src/quant/scoring.js";
import type { AShareStock, SourceRecord } from "../src/types.js";

const p0: SourceRecord = {
  id: "P0-688999-ANNUAL",
  title: "688999 测试硅光 2025 年报",
  tier: "P0",
  sourceType: "primary",
  publisher: "CNINFO",
  observedAt: "2026-06-01",
  summary: "测试硅光披露 CPO、硅光、光芯片、激光器客户验证与产能建设，订单、需求、供给缺口、价格、毛利、净利和 Q2 业绩兑现。",
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

describe("Serenity quant overlay", () => {
  it("does not apply crowding penalties to concentrated core-asset signals", () => {
    const stock: AShareStock = {
      code: "688999",
      name: "测试硅光",
      latestPrice: 88,
      pctChange: 7.2,
      totalMarketCap: 120_000_000_000,
      floatMarketCap: 95_000_000_000,
      pe: 86,
      turnover: 18,
      mainNetInflow: 900_000_000,
      industry: "光通信",
      region: "测试",
      concept: "AI算力 CPO 光模块 硅光 InP 光芯片 MPO 测试设备",
    };
    const candidate = scoreCandidate(stock, [p0, p1]);
    const run = applySerenityQuantOverlay([candidate], "2026-06-04T00:00:00.000Z");
    const quant = run.candidates[0].quant!;

    expect(quant.noCrowdingPenalty).toBe(true);
    expect(run.summary.noCrowdingPenalty).toBe(true);
    expect(quant.components.map((item) => item.name)).not.toContain("StockCrowdingRisk");
    expect(quant.industry.components.map((item) => item.name)).not.toContain("CrowdingPenalty");
    expect(quant.warnings.join("\n")).toContain("不作为拥挤降权");
    expect(quant.bucket).not.toBe("reject");
  });

  it("keeps technically strong stocks out of the core bucket when industry evidence is missing", () => {
    const stock: AShareStock = {
      code: "300001",
      name: "测试强势股",
      latestPrice: 30,
      pctChange: 9.5,
      totalMarketCap: 40_000_000_000,
      floatMarketCap: 30_000_000_000,
      pe: 40,
      turnover: 16,
      mainNetInflow: 500_000_000,
      industry: "通信设备",
      region: "测试",
      concept: "CPO 光模块 硅光",
    };
    const candidate = scoreCandidate(stock, []);
    const run = applySerenityQuantOverlay([candidate], "2026-06-04T00:00:00.000Z");
    const quant = run.candidates[0].quant!;

    expect(quant.stockScore).toBeGreaterThan(0);
    expect(quant.evidenceGate).toBe("fail");
    expect(quant.bucket).not.toBe("core");
    expect(quant.warnings.join("\n")).toContain("产业证据尚未达到核心组合准入");
  });
});
