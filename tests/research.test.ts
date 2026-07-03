import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TRADING_AGENT_SYSTEM_PROMPT } from "../src/agent/trading-agent.js";
import { scoreCandidate } from "../src/methodology.js";
import { buildCalibrationSnapshot } from "../src/research/calibration.js";
import { runAnswerSafetyEvals } from "../src/research/evals.js";
import { summarizeEvidence } from "../src/research/evidence.js";
import { summarizeSupplyChainGraph } from "../src/research/graph.js";
import { classifyWatchlistStatus, updateWatchlistFromRun } from "../src/research/watchlist.js";
import type { AShareStock, ScreenRun, SourceRecord } from "../src/types.js";

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

const genericP0: SourceRecord = {
  id: "P0-GENERIC-CNINFO",
  title: "巨潮公告入口",
  tier: "P0",
  sourceType: "primary",
  publisher: "CNINFO",
  observedAt: "2026-06-01",
  summary: "公告、年报和监管披露入口，也可搜索 CPO 公司。",
  evidenceTags: ["primary-registry", "announcement", "CPO"],
};

const candidateP0: SourceRecord = {
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

const brokerP1: SourceRecord = {
  id: "P1-688999-BROKER",
  title: "测试硅光 CPO 产业链研报",
  tier: "P1",
  sourceType: "broker_report",
  publisher: "Licensed local report inbox",
  observedAt: "2026-06-01",
  summary: "卖方研报交叉验证测试硅光 CPO 光模块和硅光激光器扩产，客户导入、认证、放量、单价和利润弹性形成超预期。",
  evidenceTags: ["688999", "CPO", "硅光", "broker-report"],
};

const otherCompanyBrokerP1: SourceRecord = {
  ...brokerP1,
  id: "P1-000001-BROKER",
  title: "其他公司 CPO 产业链研报",
  summary: "其他公司 CPO 光模块和硅光激光器扩产。",
  evidenceTags: ["000001", "其他公司", "CPO", "硅光", "broker-report"],
};

describe("research pipeline", () => {
  it("extracts structured evidence without letting generic P0 satisfy candidate P0", () => {
    const candidate = scoreCandidate(stock, [genericP0]);
    const summary = summarizeEvidence(candidate.trace.structuredEvidence ?? []);
    expect(summary.hasCandidateP0).toBe(false);
    expect(candidate.confidence).not.toBe("high");
    expect(candidate.trace.structuredEvidence?.some((item) => item.sourceId === "P0-GENERIC-CNINFO" && !item.direct)).toBe(true);
    expect(candidate.trace.coverageGaps.join("\n")).toContain("全局主来源目录不能替代候选级 P0");
  });

  it("builds graph edges that distinguish direct evidence from framework inference", () => {
    const candidate = scoreCandidate(stock, [genericP0, candidateP0, brokerP1]);
    expect(candidate.confidence).toBe("high");
    expect(candidate.trace.graph?.edges.some((edge) => edge.type === "matches-theme" && !edge.direct)).toBe(true);
    expect(candidate.trace.graph?.edges.some((edge) => edge.sourceIds.includes("P0-688999-ANNUAL") && edge.direct && edge.tier === "P0")).toBe(true);
    expect(candidate.trace.graph?.edges.some((edge) => edge.type === "mentions-product" && edge.direct && edge.sourceIds.includes("P0-688999-ANNUAL"))).toBe(true);
    expect(candidate.trace.graph?.edges.some((edge) => edge.type === "customer-signal" && edge.direct)).toBe(true);
    expect(candidate.trace.graph?.edges.some((edge) => edge.type === "supplier-signal" && edge.direct)).toBe(true);
    expect(summarizeSupplyChainGraph(candidate.trace.graph!)).toContain("Direct:");
  });

  it("keeps candidate annual reports as P0 even when they contain risk language", () => {
    const riskP0: SourceRecord = {
      ...candidateP0,
      id: "P0-688999-RISK-ANNUAL",
      summary: "测试硅光 688999 年度报告披露 CPO 业务，同时提示客户集中和价格战风险。",
    };
    const candidate = scoreCandidate(stock, [riskP0, brokerP1]);
    const summary = summarizeEvidence(candidate.trace.structuredEvidence ?? []);
    expect(summary.hasCandidateP0).toBe(true);
    expect(candidate.trace.structuredEvidence?.find((item) => item.sourceId === "P0-688999-RISK-ANNUAL")?.kind).toBe("primary-filing");
  });

  it("does not count another company's broker report as candidate P1 corroboration", () => {
    const candidate = scoreCandidate(stock, [candidateP0, otherCompanyBrokerP1]);
    expect(candidate.trace.structuredEvidence?.some((item) => item.sourceId === "P1-000001-BROKER")).toBe(false);
    expect(candidate.trace.coverageGaps.join("\n")).toContain("卖方研报");
  });

  it("updates watchlist lifecycle state from screen runs", () => {
    const candidate = scoreCandidate(stock, [genericP0]);
    const run: ScreenRun = {
      runId: "screen-research-test",
      generatedAt: "2026-06-01T00:00:00.000Z",
      candidates: [candidate],
      totalStocksScanned: 1,
      sourceCount: 1,
    };
    const entries = updateWatchlistFromRun(run);
    expect(entries).toHaveLength(1);
    expect(classifyWatchlistStatus(candidate)).toBe("evidence-needed");
    expect(entries[0].evidenceState.hasCandidateP0).toBe(false);
    expect(entries[0].events.some((item) => item.type === "created")).toBe(true);
  });

  it("builds calibration snapshots from historical report JSON", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "serenity-calibration-"));
    const runA: ScreenRun = {
      runId: "screen-a",
      generatedAt: "2026-05-31T00:00:00.000Z",
      candidates: [scoreCandidate(stock, [genericP0])],
      totalStocksScanned: 1,
      sourceCount: 1,
    };
    const runB: ScreenRun = {
      runId: "screen-b",
      generatedAt: "2026-06-01T00:00:00.000Z",
      candidates: [scoreCandidate(stock, [genericP0, candidateP0, brokerP1])],
      totalStocksScanned: 1,
      sourceCount: 3,
    };
    await fs.writeFile(path.join(dir, "screen-a.json"), JSON.stringify(runA), "utf8");
    await fs.writeFile(path.join(dir, "screen-b.json"), JSON.stringify(runB), "utf8");
    const snapshot = await buildCalibrationSnapshot(dir, "2026-06-01T01:00:00.000Z");
    expect(snapshot.reportsAnalyzed).toBe(2);
    expect(snapshot.candidatesAnalyzed).toBe(2);
    expect(snapshot.confidenceDistribution.high).toBe(1);
    expect(snapshot.latestCoverageGaps).toEqual([]);
    expect(snapshot.candidateChurn.retained).toContain("688999");
  });

  it("runs deterministic answer-safety evals", () => {
    const results = runAnswerSafetyEvals(TRADING_AGENT_SYSTEM_PROMPT);
    expect(results.every((result) => result.expectedPolicy === "refuse-execution-guidance")).toBe(true);
    expect(results.every((result) => result.passed)).toBe(true);
  });
});
