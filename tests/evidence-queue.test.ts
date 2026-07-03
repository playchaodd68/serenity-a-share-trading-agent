import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import {
  EVIDENCE_QUEUE_MAX_ENTRIES,
  buildEvidenceQueue,
  renderEvidenceQueueReport,
  writeEvidenceQueue,
  type EvidenceQueue,
} from "../src/pipeline/evidence-queue.js";
import { buryBelowBar, classifyBurialReason } from "../src/research/graveyard.js";
import { screenCandidates } from "../src/screener.js";
import type { AShareStock, GraveyardEntry, SourceRecord } from "../src/types.js";

const NOW = "2026-07-03T00:00:00.000Z";

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

function buried(partial: Partial<GraveyardEntry>): GraveyardEntry {
  return {
    code: partial.code ?? "000000",
    name: partial.name ?? "sample",
    reason: partial.reason ?? "evidence-gap",
    score: partial.score ?? 30,
    confidence: partial.confidence ?? "low",
    matchedThemes: partial.matchedThemes ?? ["AI 光互联 / CPO / 硅光"],
    killedCriterionIds: partial.killedCriterionIds ?? [],
    detail: partial.detail ?? "buried",
    buriedAt: partial.buriedAt ?? NOW,
  };
}

describe("classifyBurialReason", () => {
  it("routes low-confidence candidates with matched themes to evidence-gap", () => {
    expect(classifyBurialReason("low", ["AI 光互联 / CPO / 硅光"])).toBe("evidence-gap");
  });

  it("keeps low-confidence candidates without matched themes at below-entry-bar", () => {
    expect(classifyBurialReason("low", [])).toBe("below-entry-bar");
  });

  it("keeps medium and high confidence candidates at below-entry-bar", () => {
    expect(classifyBurialReason("medium", ["AI 光互联 / CPO / 硅光"])).toBe("below-entry-bar");
    expect(classifyBurialReason("high", ["AI 光互联 / CPO / 硅光"])).toBe("below-entry-bar");
  });

  it("routes actively-vetoed low-confidence candidates to below-entry-bar, never evidence-gap", () => {
    // 一票否决/熊方 refuted 把 confidence 封 low——这是"读过并否决"，不是"没读过"。
    expect(classifyBurialReason("low", ["AI 光互联 / CPO / 硅光"], true)).toBe("below-entry-bar");
  });
});

describe("buryBelowBar classification", () => {
  it("buries a low-confidence themed candidate as evidence-gap, not a refutation", () => {
    const candidate = scoreCandidate(stock({}), []);
    expect(candidate.confidence).toBe("low");
    const graveyard = buryBelowBar([candidate], 999, NOW);
    expect(graveyard).toHaveLength(1);
    expect(graveyard[0].reason).toBe("evidence-gap");
    expect(graveyard[0].matchedThemes.length).toBeGreaterThan(0);
  });

  it("buries a medium-confidence candidate as below-entry-bar (read and passed over)", () => {
    const candidate = { ...scoreCandidate(stock({}), []), confidence: "medium" as const };
    const graveyard = buryBelowBar([candidate], 999, NOW);
    expect(graveyard[0].reason).toBe("below-entry-bar");
  });
});

describe("buildEvidenceQueue", () => {
  it("collects only evidence-gap burials", () => {
    const queue = buildEvidenceQueue(
      [
        buried({ code: "000001", reason: "evidence-gap" }),
        buried({ code: "000002", reason: "below-entry-bar" }),
        buried({ code: "000003", reason: "kill-triggered" }),
        buried({ code: "000004", reason: "downgraded" }),
      ],
      NOW,
    );
    expect(queue.updatedAt).toBe(NOW);
    expect(queue.entries.map((entry) => entry.code)).toEqual(["000001"]);
  });

  it("sorts entries by score descending", () => {
    const queue = buildEvidenceQueue(
      [buried({ code: "000001", score: 21 }), buried({ code: "000002", score: 54.2 }), buried({ code: "000003", score: 50 })],
      NOW,
    );
    expect(queue.entries.map((entry) => entry.code)).toEqual(["000002", "000003", "000001"]);
  });

  it("caps the queue at the entry limit", () => {
    const many = Array.from({ length: EVIDENCE_QUEUE_MAX_ENTRIES + 5 }, (_, index) =>
      buried({ code: String(index).padStart(6, "0"), score: index }),
    );
    const queue = buildEvidenceQueue(many, NOW);
    expect(queue.entries).toHaveLength(EVIDENCE_QUEUE_MAX_ENTRIES);
    // Highest scores survive the cap.
    expect(queue.entries[0].score).toBe(EVIDENCE_QUEUE_MAX_ENTRIES + 4);
  });

  it("emits contract fields with concrete backfill actions", () => {
    const queue = buildEvidenceQueue([buried({ code: "300604", name: "长川科技", score: 54.2, buriedAt: "2026-07-01T00:00:00.000Z" })], NOW);
    const entry = queue.entries[0];
    expect(entry.code).toBe("300604");
    expect(entry.name).toBe("长川科技");
    expect(entry.score).toBe(54.2);
    expect(entry.confidence).toBe("low");
    expect(entry.matchedThemes.length).toBeGreaterThan(0);
    expect(entry.reasons.length).toBeGreaterThan(0);
    expect(entry.queuedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(entry.nextActions.some((action) => action.includes("巨潮"))).toBe(true);
    expect(entry.nextActions.some((action) => action.includes("FFD"))).toBe(true);
    expect(entry.nextActions.some((action) => action.includes("互动易"))).toBe(true);
  });

  it("returns an empty queue for empty input", () => {
    expect(buildEvidenceQueue([], NOW)).toEqual({ updatedAt: NOW, entries: [] });
  });
});

describe("renderEvidenceQueueReport", () => {
  it("explains how to generate the artifact when it is missing", () => {
    const text = renderEvidenceQueueReport(null);
    expect(text).toContain("runs/evidence-queue.json");
    expect(text).toContain("screen");
  });

  it("renders an explicit empty state", () => {
    const text = renderEvidenceQueueReport({ updatedAt: NOW, entries: [] });
    expect(text).toContain("证据补齐队列");
    expect(text).toContain("0");
  });

  it("renders the queue count, top entries, and next actions in Chinese", () => {
    const queue = buildEvidenceQueue(
      [
        buried({ code: "300604", name: "长川科技", score: 54.2 }),
        buried({ code: "300394", name: "天孚通信", score: 48 }),
      ],
      NOW,
    );
    const text = renderEvidenceQueueReport(queue);
    expect(text).toContain("共 2 条");
    expect(text).toContain("300604 长川科技");
    expect(text).toContain("54.2");
    expect(text).toContain("巨潮");
    expect(text).toContain("FFD");
    expect(text).toContain("互动易");
    // 语义框定：补材料，不是买入建议。
    expect(text).toContain("不是买入建议");
    // 队列按分数降序，长川在天孚之前。
    expect(text.indexOf("300604")).toBeLessThan(text.indexOf("300394"));
  });

  it("caps the rendering at the top 10 and reports the remainder", () => {
    const many = Array.from({ length: 14 }, (_, index) =>
      buried({ code: String(100000 + index), name: `样本${index}`, score: 100 - index }),
    );
    const text = renderEvidenceQueueReport(buildEvidenceQueue(many, NOW));
    expect(text).toContain("共 14 条");
    expect(text).toContain("100009"); // 第 10 名仍显示
    expect(text).not.toContain("100010"); // 第 11 名不显示
    expect(text).toContain("4"); // 剩余条数提示
  });
});

describe("writeEvidenceQueue", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("persists the queue and overwrites on the next run", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-queue-"));
    const filePath = path.join(dir, "evidence-queue.json");
    await writeEvidenceQueue(buildEvidenceQueue([buried({ code: "000001" })], NOW), filePath);
    const first = JSON.parse(await fs.readFile(filePath, "utf8")) as EvidenceQueue;
    expect(first.entries.map((entry) => entry.code)).toEqual(["000001"]);

    const later = "2026-07-04T00:00:00.000Z";
    await writeEvidenceQueue(buildEvidenceQueue([buried({ code: "000002", buriedAt: later })], later), filePath);
    const second = JSON.parse(await fs.readFile(filePath, "utf8")) as EvidenceQueue;
    expect(second.updatedAt).toBe(later);
    expect(second.entries.map((entry) => entry.code)).toEqual(["000002"]);
  });
});

describe("screenCandidates evidence queue wiring", () => {
  let dir: string | undefined;

  // 候选级定向来源：只覆盖强样本，弱样本保持 evidenceStatus=missing（P0-1 三态）。
  const strongDirect: SourceRecord = {
    id: "P1-000001-DIRECT",
    title: "强样本 客户定点点评",
    tier: "P1",
    sourceType: "broker_report",
    publisher: "test",
    observedAt: "2026-07-01",
    summary: "000001 强样本 光模块订单",
    evidenceTags: ["000001", "强样本", "candidate-direct"],
  };

  afterEach(async () => {
    if (dir) await fs.rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("writes the passed-over evidence-gap slice at the burial spot when a path is provided", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-queue-screen-"));
    const filePath = path.join(dir, "evidence-queue.json");
    const strong = stock({ code: "000001", name: "强样本", pe: 35, turnover: 4, mainNetInflow: 1_000_000 });
    const weak = stock({ code: "000002", name: "弱样本", pe: null, turnover: 0.5, mainNetInflow: -1 });
    const run = await screenCandidates([strongDirect], { maxRows: 2, topN: 1, stocks: [strong, weak], evidenceQueuePath: filePath });
    expect(run.candidates).toHaveLength(1);
    expect(run.candidates[0].stock.code).toBe("000001");

    const queue = JSON.parse(await fs.readFile(filePath, "utf8")) as EvidenceQueue;
    expect(queue.entries.map((entry) => entry.code)).toEqual(["000002"]);
    expect(queue.entries[0].confidence).toBe("low");
    expect(queue.entries[0].matchedThemes.length).toBeGreaterThan(0);
  });

  it("excludes codes with an existing active-reject graveyard record from the queue", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-queue-reject-"));
    const filePath = path.join(dir, "evidence-queue.json");
    const strong = stock({ code: "000001", name: "强样本", pe: 35, turnover: 4, mainNetInflow: 1_000_000 });
    const weak = stock({ code: "000002", name: "弱样本", pe: null, turnover: 0.5, mainNetInflow: -1 });
    const run = await screenCandidates([strongDirect], {
      maxRows: 2,
      topN: 1,
      stocks: [strong, weak],
      evidenceQueuePath: filePath,
      // 已有人工否决记录的标的不得被建议"补材料"——红色否决不能被洗白成证据不足。
      graveyard: [buried({ code: "000002", reason: "manual-reject", detail: "人工否决" })],
    });
    expect(run.candidates.map((candidate) => candidate.stock.code)).toEqual(["000001"]);

    const queue = JSON.parse(await fs.readFile(filePath, "utf8")) as EvidenceQueue;
    expect(queue.entries).toEqual([]);
  });

  it("stays side-effect free when no queue path is provided", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-queue-off-"));
    const filePath = path.join(dir, "evidence-queue.json");
    await screenCandidates([], { maxRows: 1, topN: 1, stocks: [stock({})] });
    await expect(fs.access(filePath)).rejects.toThrow();
  });
});
