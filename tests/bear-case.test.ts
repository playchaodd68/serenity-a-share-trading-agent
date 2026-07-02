import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import {
  applyBearCaseGate,
  bearKillCriteria,
  buildBearCasePrompt,
  completedBearCaseCodes,
  parseBearCase,
  renderBearCase,
  runBearCasePass,
  type BearCase,
  type BearCaseRecord,
} from "../src/research/debate/bear-case.js";
import type { LlmClient } from "../src/research/debate/llm-client.js";
import { synthesizeVerdict } from "../src/research/debate/verdict.js";
import type { AShareStock, SourceRecord } from "../src/types.js";

const stock: AShareStock = {
  code: "688999",
  name: "测试硅光",
  latestPrice: 88,
  pctChange: 2.2,
  totalMarketCap: 120_000_000_000,
  floatMarketCap: 95_000_000_000,
  pe: 60,
  turnover: 3,
  mainNetInflow: 100_000_000,
  industry: "光通信",
  region: "测试",
  concept: "AI算力 CPO 光模块 硅光 光芯片",
};

const p0: SourceRecord = {
  id: "P0-688999-ANNUAL",
  title: "688999 年报",
  tier: "P0",
  sourceType: "primary",
  publisher: "CNINFO",
  observedAt: "2026-06-01",
  summary: "测试硅光披露 CPO、硅光、光芯片客户验证与产能建设，订单、需求、缺口、价格、毛利与 Q2 业绩兑现。",
  evidenceTags: ["688999", "测试硅光", "CPO", "candidate-direct"],
};

const p1: SourceRecord = {
  id: "P1-688999-BROKER",
  title: "测试硅光研报",
  tier: "P1",
  sourceType: "broker_report",
  publisher: "inbox",
  observedAt: "2026-06-01",
  summary: "研报交叉验证测试硅光 CPO 扩产、客户导入、认证、放量、单价和利润弹性超预期。",
  evidenceTags: ["688999", "CPO", "broker-report"],
};

const VALID_BEAR: BearCase = {
  steelMan: "正方最强逻辑：AI capex 扩散下 CPO 光互联环节产能受限，公司具备 P0 级客户验证与产能兑现证据。",
  failureFindings: [
    { questionId: "second-source", finding: "客户正在认证第二供应商，周期约 9 个月。", severity: "high", evidenceRefs: ["P1-688999-BROKER"], confidence: 0.7 },
    { questionId: "substitution-design-out", finding: "铜互连延寿方案可能推迟 CPO 渗透。", severity: "medium", evidenceRefs: ["COVERAGE-GAP"], confidence: 0.4 },
    { questionId: "double-ordering-bullwhip", finding: "订单中疑似存在重复下单。", severity: "medium", evidenceRefs: ["COVERAGE-GAP"], confidence: 0.35 },
    { questionId: "valuation-kill", finding: "当前 PE 隐含三年翻倍增长，验证落空回撤大。", severity: "high", evidenceRefs: ["P0-688999-ANNUAL"], confidence: 0.65 },
    { questionId: "capex-leverage", finding: "下游云厂 capex 放缓将双重打击收入。", severity: "low", evidenceRefs: ["COVERAGE-GAP"], confidence: 0.3 },
  ],
  bearArguments: [{ claim: "二次供货认证一旦完成，独家份额与议价权同时受损。", evidenceRefs: ["P1-688999-BROKER"] }],
  keyQuestions: ["第二供应商认证进度的 P0 证据？"],
  killCriterionCandidates: [
    { trigger: "若客户公告第二供应商通过认证，独家卡点失效。", sourceCheck: "客户公告/供应链调研", horizonDays: 90, posteriorDelta: -12 },
  ],
  verdict: "weakened",
};

function fakeClient(outputs: string[]): LlmClient {
  let call = 0;
  return {
    label: "fake/test",
    complete: async () => {
      const output = outputs[Math.min(call, outputs.length - 1)];
      call += 1;
      return output;
    },
  };
}

describe("bear-case prompt (blind, assigned stance)", () => {
  it("carries the evidence pack but no user or bull-conclusion context", () => {
    const candidate = scoreCandidate(stock, [p0, p1]);
    const prompt = buildBearCasePrompt(candidate);
    expect(prompt.system).toContain("看空立场");
    expect(prompt.system).toContain("Steel-man");
    expect(prompt.system).toContain("失效五问".slice(0, 2));
    expect(prompt.system).toContain("second-source");
    expect(prompt.system).toContain("禁止给出目标价");
    expect(prompt.system).toContain("没有用户持仓、没有会话历史");
    expect(prompt.user).toContain("P0-688999-ANNUAL");
    // The evidence pack itself must carry no user/holdings content.
    expect(prompt.user).not.toContain("持仓");
    expect(prompt.user).not.toContain("用户观点");
  });
});

describe("bear-case parsing and pass", () => {
  it("parses valid JSON (including fenced output)", () => {
    expect(parseBearCase(JSON.stringify(VALID_BEAR))).not.toBeNull();
    expect(parseBearCase("```json\n" + JSON.stringify(VALID_BEAR) + "\n```")).not.toBeNull();
  });

  it("rejects schema-invalid output", () => {
    expect(parseBearCase('{"steelMan": "too short"}')).toBeNull();
    expect(parseBearCase("not json")).toBeNull();
  });

  it("retries once and succeeds on the second attempt", async () => {
    const candidate = scoreCandidate(stock, [p0, p1]);
    const record = await runBearCasePass(candidate, fakeClient(["garbage", JSON.stringify(VALID_BEAR)]), { now: "2026-07-02T00:00:00.000Z" });
    expect(record.status).toBe("completed");
    expect(record.report?.verdict).toBe("weakened");
  });

  it("fails conservatively when output never validates (never unlocks anything)", async () => {
    const candidate = scoreCandidate(stock, [p0, p1]);
    const record = await runBearCasePass(candidate, fakeClient(["garbage"]), { now: "2026-07-02T00:00:00.000Z" });
    expect(record.status).toBe("parse-failed");
    expect(record.report).toBeNull();
    expect(completedBearCaseCodes({ [record.code]: record }).size).toBe(0);
  });
});

describe("bear-case gate (high confidence requires the adversarial pass)", () => {
  it("downgrades high-confidence candidates without a bear case to medium", () => {
    const candidate = scoreCandidate(stock, [p0, p1]);
    expect(candidate.confidence).toBe("high");
    const gated = applyBearCaseGate(candidate, new Set());
    expect(gated.confidence).toBe("medium");
    expect(gated.trace.ceilingReasons?.join("\n")).toContain("反方研究员 pass 未完成");
    expect(gated.trace.nextActions?.join("\n")).toContain("research:bear");
  });

  it("keeps high confidence when the bear pass is completed", () => {
    const candidate = scoreCandidate(stock, [p0, p1]);
    const gated = applyBearCaseGate(candidate, new Set(["688999"]));
    expect(gated.confidence).toBe("high");
  });

  it("leaves low/medium candidates untouched", () => {
    const candidate = scoreCandidate({ ...stock, code: "300500", name: "普通股" }, []);
    const gated = applyBearCaseGate(candidate, new Set());
    expect(gated.confidence).toBe(candidate.confidence);
  });
});

describe("bear kill criteria feed the existing discipline system", () => {
  it("converts killCriterionCandidates into dated KillCriterion entries", () => {
    const record: BearCaseRecord = {
      code: "688999",
      name: "测试硅光",
      generatedAt: "2026-07-02T00:00:00.000Z",
      model: "fake/test",
      status: "completed",
      report: VALID_BEAR,
    };
    const criteria = bearKillCriteria(record, record.generatedAt);
    expect(criteria).toHaveLength(1);
    expect(criteria[0].id).toBe("kc-bear-1");
    expect(criteria[0].category).toBe("negative-signal");
    expect(criteria[0].dueDate > record.generatedAt).toBe(true);
    expect(criteria[0].posteriorDelta).toBeLessThan(0);
  });
});

describe("verdict synthesis (anti fence-sitting, no forced point estimates)", () => {
  const highCandidate = { score: 75, confidence: "high" as const };
  const midCandidate = { score: 50, confidence: "medium" as const };

  it("missing bear pass blocks upgrades", () => {
    const verdict = synthesizeVerdict(highCandidate, null);
    expect(verdict.rating).toBe("neutral");
    expect(verdict.bearVerdict).toBe("missing");
  });

  it("refuted with high-severity high-confidence finding => kill", () => {
    const refuted: BearCase = { ...VALID_BEAR, verdict: "refuted" };
    expect(synthesizeVerdict(highCandidate, refuted).rating).toBe("kill");
  });

  it("refuted without a strong finding => reduce", () => {
    const softRefuted: BearCase = {
      ...VALID_BEAR,
      verdict: "refuted",
      failureFindings: VALID_BEAR.failureFindings.map((finding) => ({ ...finding, severity: "medium" as const })),
    };
    expect(synthesizeVerdict(highCandidate, softRefuted).rating).toBe("reduce");
  });

  it("weakened => neutral when the bull score holds, reduce when it does not", () => {
    expect(synthesizeVerdict(midCandidate, VALID_BEAR).rating).toBe("neutral");
    expect(synthesizeVerdict({ score: 30, confidence: "low" }, VALID_BEAR).rating).toBe("reduce");
  });

  it("intact => strong-add only with high score and high confidence", () => {
    const intact: BearCase = { ...VALID_BEAR, verdict: "intact" };
    expect(synthesizeVerdict(highCandidate, intact).rating).toBe("strong-add");
    expect(synthesizeVerdict(midCandidate, intact).rating).toBe("add");
    expect(synthesizeVerdict({ score: 20, confidence: "low" }, intact).rating).toBe("neutral");
  });
});

describe("bear-case rendering", () => {
  it("renders a readable markdown report", () => {
    const record: BearCaseRecord = {
      code: "688999",
      name: "测试硅光",
      generatedAt: "2026-07-02T00:00:00.000Z",
      model: "fake/test",
      status: "completed",
      report: VALID_BEAR,
    };
    const rendered = renderBearCase(record);
    expect(rendered).toContain("反方研究员 pass");
    expect(rendered).toContain("Steel-man");
    expect(rendered).toContain("失效五问");
    expect(rendered).toContain("weakened");
  });
});
