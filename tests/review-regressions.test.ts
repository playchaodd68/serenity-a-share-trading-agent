import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assessHypeRisk, scoreCandidate } from "../src/methodology.js";
import { applySerenityQuantOverlay } from "../src/quant/scoring.js";
import { evaluateKillCriteria } from "../src/research/kill-criteria.js";
import { combinedBaseRate } from "../src/research/graveyard.js";
import {
  buildResolutionInputsFromWatchlist,
  parseFfdCloseSeries,
  windowReturn,
} from "../src/research/resolution-provider.js";
import { computeHotThemeDowngrades } from "../src/research/theme-heat.js";
import { readJsonFile, writeJsonFile } from "../src/utils/fs.js";
import type { AShareStock, CandidateResolution, GraveyardEntry, KillCriterion, SourceRecord, WatchlistEntry } from "../src/types.js";

const NOW = "2026-07-02T00:00:00.000Z";

function stock(overrides: Partial<AShareStock>): AShareStock {
  return {
    code: "688100",
    name: "测试光芯片",
    latestPrice: 50,
    pctChange: 1,
    totalMarketCap: 30_000_000_000,
    floatMarketCap: 15_000_000_000,
    pe: 45,
    turnover: 2,
    mainNetInflow: 0,
    industry: "光通信",
    region: "测试",
    concept: "CPO 光模块 硅光 光芯片",
    ...overrides,
  };
}

function source(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    id: "SRC",
    title: "来源",
    tier: "P2",
    sourceType: "social",
    publisher: "test",
    observedAt: "2026-06-20",
    summary: "",
    evidenceTags: ["688100", "测试光芯片", "CPO"],
    ...overrides,
  };
}

describe("reflexivity thresholds are pinned (5% pct / 8% turnover)", () => {
  const p2 = source({ id: "P2-X", summary: "大V点名" });
  it("fires exactly at the boundary", () => {
    expect(assessHypeRisk(stock({ pctChange: 5, turnover: 8 }), [p2], undefined, NOW).reflexivityFlag).toBe(true);
  });
  it("does not fire just below either threshold", () => {
    expect(assessHypeRisk(stock({ pctChange: 4.9, turnover: 8 }), [p2], undefined, NOW).reflexivityFlag).toBe(false);
    expect(assessHypeRisk(stock({ pctChange: 5, turnover: 7.9 }), [p2], undefined, NOW).reflexivityFlag).toBe(false);
  });
});

describe("reflexivity requires FRESH strong evidence, not any stale P0", () => {
  const surge = stock({ pctChange: 9, turnover: 15 });
  it("a stale P0 (older than 90 days) no longer suppresses the guard", () => {
    const staleP0 = source({ id: "P0-OLD", tier: "P0", sourceType: "primary", observedAt: "2025-01-01", summary: "一年前的公告" });
    expect(assessHypeRisk(surge, [staleP0], undefined, NOW).reflexivityFlag).toBe(true);
  });
  it("a fresh P0 within 90 days suppresses it", () => {
    const freshP0 = source({ id: "P0-NEW", tier: "P0", sourceType: "primary", observedAt: "2026-06-15", summary: "上月公告" });
    expect(assessHypeRisk(surge, [freshP0], undefined, NOW).reflexivityFlag).toBe(false);
  });
  it("unparseable dates count as stale (conservative)", () => {
    const badDate = source({ id: "P0-BAD", tier: "P0", sourceType: "primary", observedAt: "未知", summary: "无日期" });
    expect(assessHypeRisk(surge, [badDate], undefined, NOW).reflexivityFlag).toBe(true);
  });
});

describe("hype penalty magnitude is pinned (unit 3, reflexivity 6, cap 18)", () => {
  it("caps at exactly 18 when signals saturate", () => {
    const saturated = source({
      id: "P2-HYPE",
      summary: "情绪高位 题材炒作 游资接力 连板 涨停潮 拥挤交易 机构抱团 透支 已充分定价 被抢跑 热度过高 短线过热",
    });
    const hype = assessHypeRisk(stock({ pctChange: 9, turnover: 15 }), [saturated], undefined, NOW);
    expect(hype.penalty).toBe(18);
  });
  it("one text signal costs exactly 3", () => {
    const one = source({ id: "P2-1", summary: "游资接力" });
    expect(assessHypeRisk(stock({}), [one], undefined, NOW).penalty).toBe(3);
  });
});

describe("hot-theme heat threshold is pinned at 5", () => {
  it("heat exactly 5.0 qualifies for downgrade review; 4.9 does not", () => {
    // heat = avgTurnover + max(avgPct,0)*1.5; turnover 5, pct 0 => 5.0
    const atLine = scoreCandidate(stock({ turnover: 5, pctChange: 0 }), []);
    const below = scoreCandidate(stock({ code: "688101", turnover: 4.9, pctChange: 0 }), []);
    const entriesAt = computeHotThemeDowngrades([atLine]);
    const entriesBelow = computeHotThemeDowngrades([below]);
    expect(entriesAt[0].downgraded).toBe(true);
    expect(entriesBelow[0].downgraded).toBe(false);
  });
});

describe("disqualifier caps the quant bucket, not only confidence", () => {
  it("a vetoed candidate with strong P0+P1 evidence can never present as core", () => {
    const p0 = source({
      id: "P0-BAD",
      tier: "P0",
      sourceType: "primary",
      observedAt: "2026-06-20",
      summary: "公司公告：实际控制人被证监会立案调查；同时披露 CPO 产能与订单",
      evidenceTags: ["688100", "测试光芯片", "candidate-direct"],
    });
    const p1 = source({ id: "P1-OK", tier: "P1", sourceType: "broker_report", summary: "研报覆盖 CPO 扩产 客户导入 认证 放量", evidenceTags: ["688100", "broker-report"] });
    const candidate = scoreCandidate(stock({ pe: 40 }), [p0, p1]);
    expect(candidate.trace.disqualifiers?.triggered).toBe(true);
    const run = applySerenityQuantOverlay([candidate], NOW);
    const quant = run.candidates[0].quant!;
    expect(quant.bucket).toBe("reject");
    expect(quant.excludedReasons.join("\n")).toContain("一票否决");
  });
});

describe("bear-derived falsifiers surface as overdue, never silently expire", () => {
  const state = { hasCandidateP0: true, activeNegativeSignals: [] as string[] };
  it("bear-falsifier category goes overdue when due", () => {
    const criterion: KillCriterion = {
      id: "kc-bear-1",
      category: "bear-falsifier",
      trigger: "第二供应商认证通过",
      dueDate: "2026-06-01T00:00:00.000Z",
      sourceCheck: "客户公告",
      posteriorDelta: -12,
      signal: "bear-case:688100",
    };
    const evaluation = evaluateKillCriteria([criterion], state, NOW);
    expect(evaluation.overdue).toHaveLength(1);
    expect(evaluation.fired).toHaveLength(0);
  });
  it("legacy persisted bear criteria under negative-signal also go overdue", () => {
    const legacy: KillCriterion = {
      id: "kc-bear-legacy",
      category: "negative-signal",
      trigger: "旧版 bear 条款",
      dueDate: "2026-06-01T00:00:00.000Z",
      sourceCheck: "人工",
      posteriorDelta: -8,
      signal: "bear-case:688100",
    };
    const evaluation = evaluateKillCriteria([legacy], state, NOW);
    expect(evaluation.overdue).toHaveLength(1);
    expect(evaluation.fired).toHaveLength(0);
  });
});

describe("combinedBaseRate uses one measurement basis (deadband labels)", () => {
  it("excludes inconclusive survivors instead of counting their sign outcome", () => {
    const survivor = (label: CandidateResolution["outcomeLabel"], outcome: 0 | 1): CandidateResolution => ({
      code: "1",
      name: "x",
      posterior: 50,
      probability: 0.5,
      confidence: "medium",
      evidenceTier: "P0-capped",
      entryDate: NOW,
      horizonDays: 60,
      stockReturn: 0,
      benchmarkReturn: 0,
      realizedAlpha: 0,
      outcome,
      outcomeLabel: label,
      brier: 0.25,
      resolvedAt: NOW,
    });
    const buried: GraveyardEntry = {
      code: "2",
      name: "y",
      reason: "kill-triggered",
      score: 10,
      confidence: "low",
      matchedThemes: [],
      killedCriterionIds: [],
      detail: "",
      buriedAt: NOW,
      outcomeLabel: "falsified",
    };
    // inconclusive survivor with sign-outcome 1 must NOT inflate the hit rate
    const rate = combinedBaseRate([survivor("inconclusive", 1), survivor("validated", 1)], [buried]);
    expect(rate.n).toBe(2);
    expect(rate.hitRate).toBeCloseTo(0.5);
  });
});

describe("atomic JSON persistence with corrupt-file recovery", () => {
  it("writes atomically (no temp leftovers) and recovers from corrupt files without data loss", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-utils-"));
    const filePath = path.join(dir, "state.json");
    await writeJsonFile(filePath, { ok: 1 });
    expect(await readJsonFile(filePath, null)).toEqual({ ok: 1 });
    expect((await fs.readdir(dir)).filter((name) => name.includes(".tmp-"))).toEqual([]);

    await fs.writeFile(filePath, "{corrupt", "utf8");
    const fallback = await readJsonFile(filePath, { fallback: true });
    expect(fallback).toEqual({ fallback: true });
    const names = await fs.readdir(dir);
    expect(names.some((name) => name.includes(".corrupt-"))).toBe(true);
  });
});

describe("resolution producer (fulfillment loop finally has a write side)", () => {
  const entry = (code: string, firstSeenAt: string): WatchlistEntry => ({
    code,
    name: `股票${code}`,
    status: "investigating",
    score: 52,
    confidence: "medium",
    firstSeenAt,
    lastSeenAt: firstSeenAt,
    nextReviewAt: firstSeenAt,
    evidenceState: { hasCandidateP0: true, directEvidenceCount: 1, corroboratingEvidenceCount: 1, riskEvidenceCount: 0 },
    coverageGaps: [],
    nextActions: [],
    events: [],
  });

  it("selects only entries whose horizon has fully elapsed", () => {
    const inputs = buildResolutionInputsFromWatchlist(
      [entry("300308", "2026-04-01T00:00:00.000Z"), entry("688072", "2026-06-20T00:00:00.000Z")],
      NOW,
      60,
    );
    expect(inputs.map((input) => input.code)).toEqual(["300308"]);
    expect(inputs[0].posterior).toBe(52);
    expect(inputs[0].evidenceAnchored).toBe(true);
  });

  it("parses FFD close series from JSON envelopes and markdown tables", () => {
    const json = JSON.stringify({ data: [{ date: "2026-04-01", close: 10 }, { date: "2026-06-01", close: 12 }] });
    expect(parseFfdCloseSeries(json)).toHaveLength(2);
    const markdown = ["| 日期 | 收盘 |", "| --- | --- |", "| 2026-04-01 | 10.0 |", "| 2026-06-01 | 12.5 |"].join("\n");
    expect(parseFfdCloseSeries(markdown)).toHaveLength(2);
    expect(parseFfdCloseSeries("no table here")).toEqual([]);
  });

  it("computes window returns and refuses degenerate windows", () => {
    const bars = [
      { date: "2026-04-01", close: 10 },
      { date: "2026-05-30", close: 11 },
      { date: "2026-06-02", close: 12 },
    ];
    const ret = windowReturn(bars, "2026-04-01T00:00:00.000Z", 60);
    expect(ret).toBeCloseTo(0.1); // exits at 2026-05-30 (last bar within window)
    expect(windowReturn([bars[0]], "2026-04-01T00:00:00.000Z", 60)).toBeNull();
  });
});
