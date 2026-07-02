import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import { annotateGraveyardRecall, graveyardRecallNotes, recallSimilarBuried } from "../src/research/graveyard.js";
import type { AShareStock, GraveyardEntry } from "../src/types.js";

const stock: AShareStock = {
  code: "300308",
  name: "测试光模块",
  latestPrice: 100,
  pctChange: 1,
  totalMarketCap: 100_000_000_000,
  floatMarketCap: 80_000_000_000,
  pe: 40,
  turnover: 2,
  mainNetInflow: 0,
  industry: "通信设备",
  region: "测试",
  concept: "CPO 光模块 硅光",
};

function buried(overrides: Partial<GraveyardEntry>): GraveyardEntry {
  return {
    code: "300999",
    name: "死亡光模块",
    reason: "kill-triggered",
    score: 20,
    confidence: "low",
    matchedThemes: ["AI 光互联 / CPO / 硅光"],
    killedCriterionIds: ["kc-1"],
    detail: "价格战导致单位利润假设失效",
    buriedAt: "2026-05-01T00:00:00.000Z",
    outcomeLabel: "falsified",
    realizedAlpha: -0.25,
    ...overrides,
  };
}

describe("graveyard recall (N2: write-only storage -> adversarial context)", () => {
  it("recalls same-code entries first, then shared-theme entries", () => {
    const candidate = scoreCandidate(stock, []);
    const graveyard = [buried({}), buried({ code: "300308", name: "测试光模块", buriedAt: "2026-04-01T00:00:00.000Z" })];
    const recalls = recallSimilarBuried(candidate, graveyard);
    expect(recalls[0].match).toBe("same-code");
    expect(recalls[1].match).toBe("shared-theme");
  });

  it("ignores unrelated buried entries", () => {
    const candidate = scoreCandidate(stock, []);
    const unrelated = buried({ code: "600111", matchedThemes: ["机器人 / 具身智能硬件供应链"] });
    expect(recallSimilarBuried(candidate, [unrelated])).toEqual([]);
  });

  it("renders notes with reason, detail and realized outcome", () => {
    const notes = graveyardRecallNotes([{ entry: buried({}), match: "shared-theme" }]);
    expect(notes[0]).toContain("相似论点");
    expect(notes[0]).toContain("价格战");
    expect(notes[0]).toContain("falsified");
  });

  it("annotates candidate risks without touching score or confidence", () => {
    const candidate = scoreCandidate(stock, []);
    const before = { score: candidate.score, confidence: candidate.confidence, riskCount: candidate.trace.risks.length };
    const [annotated] = annotateGraveyardRecall([candidate], [buried({})]);
    expect(annotated.score).toBe(before.score);
    expect(annotated.confidence).toBe(before.confidence);
    expect(annotated.trace.risks.length).toBe(before.riskCount + 1);
    expect(annotated.trace.risks.join("\n")).toContain("墓地召回");
  });

  it("is a no-op for an empty graveyard and never duplicates notes", () => {
    const candidate = scoreCandidate(stock, []);
    const untouched = annotateGraveyardRecall([candidate], []);
    expect(untouched[0]).toBe(candidate);
    const once = annotateGraveyardRecall([candidate], [buried({})]);
    const twice = annotateGraveyardRecall(once, [buried({})]);
    expect(twice[0].trace.risks.filter((risk) => risk.includes("墓地召回"))).toHaveLength(1);
  });
});
