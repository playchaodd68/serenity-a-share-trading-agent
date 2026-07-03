import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EvidenceQueue } from "../src/pipeline/evidence-queue.js";
import {
  HIGH_PRIOR_EVIDENCE_MISSING_LIMIT,
  UNMATCHED_AUDIT_INDUSTRY_LIMIT,
  UNMATCHED_AUDIT_SAMPLE_LIMIT,
  buildUnmatchedAudit,
  screenCandidates,
} from "../src/screener.js";
import type { AShareStock, Candidate, SourceRecord } from "../src/types.js";

function stock(partial: Partial<AShareStock>): AShareStock {
  return {
    code: partial.code ?? "000001",
    name: partial.name ?? "测试光芯片",
    latestPrice: partial.latestPrice ?? 10,
    pctChange: partial.pctChange ?? 1,
    totalMarketCap: partial.totalMarketCap ?? 20_000_000_000,
    floatMarketCap: partial.floatMarketCap ?? 10_000_000_000,
    pe: partial.pe === undefined ? 35 : partial.pe,
    turnover: partial.turnover === undefined ? 4 : partial.turnover,
    mainNetInflow: partial.mainNetInflow === undefined ? 1_000_000 : partial.mainNetInflow,
    industry: partial.industry ?? "光通信",
    region: partial.region ?? "测试",
    concept: partial.concept ?? "CPO 硅光 激光器",
  };
}

// 候选级定向来源：candidate-direct + 代码识别，只覆盖指定标的（其余保持证据缺失态）。
function coveringSource(code: string, name: string): SourceRecord {
  return {
    id: `P1-${code}-DIRECT`,
    title: `${name} 客户定点点评`,
    tier: "P1",
    sourceType: "broker_report",
    publisher: "test",
    observedAt: "2026-07-01",
    summary: `${code} ${name} 光模块订单`,
    evidenceTags: [code, name, "candidate-direct"],
  };
}

describe("evidence tri-state seating (P0-1)", () => {
  const coveredWeak = stock({ code: "600111", name: "弱覆盖", concept: "CPO", pe: null, turnover: 0.5, mainNetInflow: -1 });
  const missingStrong = stock({ code: "300999", name: "缺证样本", concept: "AI算力 CPO 光模块 硅光 InP 光芯片 MPO" });

  it("gives topN seats to covered candidates only, even when a missing candidate outscores them", async () => {
    let matched: Candidate[] = [];
    const run = await screenCandidates([coveringSource("600111", "弱覆盖")], {
      maxRows: 2,
      topN: 2,
      stocks: [coveredWeak, missingStrong],
      onMatched: (candidates) => {
        matched = candidates;
      },
    });
    const covered = matched.find((candidate) => candidate.stock.code === "600111");
    const missing = matched.find((candidate) => candidate.stock.code === "300999");
    expect(covered?.trace.evidenceStatus).toBe("covered");
    expect(missing?.trace.evidenceStatus).toBe("missing");
    // 测试有效性前提：missing 分数确实高于 covered，席位却仍只给 covered。
    expect(missing!.score).toBeGreaterThan(covered!.score);
    expect(run.candidates.map((candidate) => candidate.stock.code)).toEqual(["600111"]);
  });

  it("surfaces missing candidates in the evidenceMissingHighPrior block instead of seats", async () => {
    const run = await screenCandidates([coveringSource("600111", "弱覆盖")], {
      maxRows: 2,
      topN: 2,
      stocks: [coveredWeak, missingStrong],
    });
    const block = run.evidenceMissingHighPrior ?? [];
    expect(block.map((entry) => entry.code)).toEqual(["300999"]);
    expect(block[0].name).toBe("缺证样本");
    expect(block[0].confidence).toBe("low");
    expect(block[0].priorScore).toBeGreaterThan(0);
    expect(block[0].matchedThemes.length).toBeGreaterThan(0);
  });

  it("orders the block by priorScore descending and caps it at the limit", async () => {
    const many = Array.from({ length: HIGH_PRIOR_EVIDENCE_MISSING_LIMIT + 5 }, (_, index) =>
      stock({ code: String(index + 1).padStart(6, "0"), name: `样本${index}`, concept: "CPO" }),
    );
    const rich = stock({ code: "999999", name: "高先验", concept: "AI算力 CPO 光模块 硅光 InP 光芯片 MPO" });
    const run = await screenCandidates([], { maxRows: 100, topN: 3, stocks: [...many, rich] });
    // 零 covered 的一天：席位空置（宁缺毋滥），不是把 missing 顶上去。
    expect(run.candidates).toEqual([]);
    const block = run.evidenceMissingHighPrior ?? [];
    expect(block).toHaveLength(HIGH_PRIOR_EVIDENCE_MISSING_LIMIT);
    expect(block[0].code).toBe("999999");
    for (let index = 1; index < block.length; index += 1) {
      expect(block[index - 1].priorScore).toBeGreaterThanOrEqual(block[index].priorScore);
    }
  });

  it("excludes active-reject graveyard codes from the block", async () => {
    const run = await screenCandidates([coveringSource("600111", "弱覆盖")], {
      maxRows: 2,
      topN: 2,
      stocks: [coveredWeak, missingStrong],
      graveyard: [
        {
          code: "300999",
          name: "缺证样本",
          reason: "manual-reject",
          score: 40,
          confidence: "low",
          matchedThemes: ["AI 光互联 / CPO / 硅光"],
          killedCriterionIds: [],
          detail: "人工否决",
          buriedAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    expect((run.evidenceMissingHighPrior ?? []).map((entry) => entry.code)).toEqual([]);
  });
});

describe("evidence queue seam on zero-covered days (P0-1 衔接)", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("feeds missing candidates to the evidence queue even when no seat is awarded", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "screener-queue-"));
    const filePath = path.join(dir, "evidence-queue.json");
    const a = stock({ code: "000001", name: "样本A", concept: "AI算力 CPO 光模块 硅光" });
    const b = stock({ code: "000002", name: "样本B", concept: "CPO" });
    const run = await screenCandidates([], { maxRows: 2, topN: 1, stocks: [a, b], evidenceQueuePath: filePath });
    expect(run.candidates).toEqual([]);
    const queue = JSON.parse(await fs.readFile(filePath, "utf8")) as EvidenceQueue;
    expect(queue.entries.map((entry) => entry.code)).toEqual(["000001", "000002"]);
  });
});

describe("unmatched audit (P0-7)", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const themed = stock({ code: "000001", name: "样本A", concept: "CPO" });
  const bankA = stock({ code: "600001", name: "普通甲", industry: "银行", concept: "无", region: "测试" });
  const bankB = stock({ code: "600002", name: "普通乙", industry: "银行", concept: "无", region: "测试" });
  const liquor = stock({ code: "600003", name: "普通丙", industry: "白酒", concept: "无", region: "测试" });

  it("writes a daily aggregate snapshot when unmatchedAuditDir is provided", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "unmatched-audit-"));
    const run = await screenCandidates([], { maxRows: 4, topN: 1, stocks: [themed, bankA, bankB, liquor], unmatchedAuditDir: dir });
    const filePath = path.join(dir, `${run.generatedAt.slice(0, 10)}.json`);
    const snapshot = JSON.parse(await fs.readFile(filePath, "utf8"));
    expect(snapshot.date).toBe(run.generatedAt.slice(0, 10));
    expect(snapshot.total).toBe(4);
    expect(snapshot.unmatchedCount).toBe(3);
    expect(snapshot.byIndustryTop20).toEqual([
      { industry: "银行", count: 2 },
      { industry: "白酒", count: 1 },
    ]);
    expect(snapshot.sampledCodes).toEqual(["600001", "600002", "600003"]);
  });

  it("stays side-effect free when unmatchedAuditDir is not provided", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "unmatched-audit-off-"));
    const auditDir = path.join(dir, "unmatched-audit");
    await screenCandidates([], { maxRows: 4, topN: 1, stocks: [themed, bankA] });
    await expect(fs.access(auditDir)).rejects.toThrow();
  });

  it("caps industries at the top 20 and samples at the first 50 codes", () => {
    const unmatched = Array.from({ length: 60 }, (_, index) =>
      stock({ code: String(index).padStart(6, "0"), name: `普通${index}`, industry: `行业${index % 25}`, concept: "无", region: "测试" }),
    );
    const snapshot = buildUnmatchedAudit(unmatched, 100, "2026-07-03");
    expect(snapshot.total).toBe(100);
    expect(snapshot.unmatchedCount).toBe(60);
    expect(snapshot.byIndustryTop20).toHaveLength(UNMATCHED_AUDIT_INDUSTRY_LIMIT);
    // 计数降序：行业0-9 各 3 只在前，行业10 之后各 2 只。
    expect(snapshot.byIndustryTop20[0].count).toBe(3);
    expect(snapshot.byIndustryTop20[UNMATCHED_AUDIT_INDUSTRY_LIMIT - 1].count).toBe(2);
    expect(snapshot.sampledCodes).toHaveLength(UNMATCHED_AUDIT_SAMPLE_LIMIT);
    expect(snapshot.sampledCodes[0]).toBe("000000");
  });
});
