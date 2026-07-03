import { describe, expect, it } from "vitest";
import type { EarningsExpress, EarningsPreannouncement } from "../src/connectors/eastmoney-earnings.js";
import {
  computeEsp,
  deriveEarningsEvents,
  espBeat,
  PEAD_WINDOW,
  POSITIVE_PREANNOUNCEMENT_TYPES,
  preannouncementForecastMean,
  toEvidenceRecords,
} from "../src/research/earnings-surprise.js";
import { extractCandidateEvidence } from "../src/research/evidence.js";
import type { Candidate } from "../src/types.js";

function preannouncement(overrides: Partial<EarningsPreannouncement> = {}): EarningsPreannouncement {
  return {
    code: "603618",
    name: "杭电股份",
    periodEnd: "2026-06-30",
    type: "预增",
    indicator: "归属于上市公司股东的净利润",
    forecastNetProfitLow: 360000000,
    forecastNetProfitHigh: 400000000,
    changePctLow: 852.03,
    changePctHigh: 957.82,
    prevYearSamePeriodNetProfit: 37813800,
    announceDate: "2026-07-04",
    content: "预计2026年1-6月归属于上市公司股东的净利润盈利:36,000万元至40,000万元。",
    ...overrides,
  };
}

function express(overrides: Partial<EarningsExpress> = {}): EarningsExpress {
  return {
    code: "688806",
    name: "泰诺麦博",
    periodEnd: "2026-03-31",
    netProfit: -96385000,
    netProfitYoyPct: 45.458771931979,
    prevYearSamePeriodNetProfit: -176719526.52,
    revenue: 24928900,
    revenueYoyPct: 14623.3436659188,
    eps: null,
    announceDate: "2026-05-22",
    ...overrides,
  };
}

describe("computeEsp / espBeat", () => {
  it("computes ESP=(实际−预期)/|预期|", () => {
    expect(computeEsp(110, 100)).toBeCloseTo(0.1, 10);
    expect(computeEsp(90, 100)).toBeCloseTo(-0.1, 10);
    // 负基数：亏损小于预期亏损 = 正 ESP。
    expect(computeEsp(-50, -100)).toBeCloseTo(0.5, 10);
  });

  it("returns null when the expectation is zero or inputs are not finite", () => {
    expect(computeEsp(100, 0)).toBeNull();
    expect(computeEsp(Number.NaN, 100)).toBeNull();
    expect(computeEsp(100, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("espBeat is strictly ESP>0 and treats null as no signal", () => {
    expect(espBeat(0.01)).toBe(true);
    expect(espBeat(0)).toBe(false);
    expect(espBeat(-0.2)).toBe(false);
    expect(espBeat(null)).toBe(false);
  });
});

describe("preannouncementForecastMean", () => {
  it("takes the 区间均值 when both bounds exist (星火11：偏差中位数≈5%)", () => {
    expect(preannouncementForecastMean(preannouncement())).toBe(380000000);
  });

  it("uses the single available bound, and null when 仅披露增速区间", () => {
    expect(preannouncementForecastMean(preannouncement({ forecastNetProfitHigh: null }))).toBe(360000000);
    expect(preannouncementForecastMean(preannouncement({ forecastNetProfitLow: null, forecastNetProfitHigh: null }))).toBeNull();
  });
});

describe("deriveEarningsEvents — 预告", () => {
  it("emits forecast-positive only for 类型∈{预增/预盈/扭亏}", () => {
    expect([...POSITIVE_PREANNOUNCEMENT_TYPES]).toEqual(["预增", "预盈", "扭亏"]);
    const events = deriveEarningsEvents(
      [
        preannouncement(),
        preannouncement({ code: "000002", name: "样本B", type: "扭亏" }),
        preannouncement({ code: "000003", name: "样本C", type: "预减" }),
        preannouncement({ code: "000004", name: "样本D", type: "预亏" }),
        preannouncement({ code: "000005", name: "样本E", type: "略增" }),
      ],
      [],
    );
    // 同公告日按代码升序 —— 输出完全确定性。
    expect(events.map((event) => `${event.code}:${event.kind}`)).toEqual(["000002:forecast-positive", "603618:forecast-positive"]);
    const hangdian = events.find((event) => event.code === "603618");
    expect(hangdian?.window).toBe(PEAD_WINDOW);
    expect(hangdian?.netProfit).toBe(380000000);
    expect(hangdian?.detail).toContain("预增");
  });

  it("keeps 增速区间-only forecasts as events but never back-solves net profit (§2b-2)", () => {
    const events = deriveEarningsEvents(
      [preannouncement({ forecastNetProfitLow: null, forecastNetProfitHigh: null, changePctLow: 50, changePctHigh: 80 })],
      [],
    );
    expect(events).toHaveLength(1);
    expect(events[0].netProfit).toBeNull();
    expect(events[0].detail).toContain("不倒算");
    expect(events[0].detail).toContain("快报");
  });

  it("dedupes 修正公告 keeping the latest announceDate per code+period", () => {
    const events = deriveEarningsEvents(
      [preannouncement({ announceDate: "2026-07-01" }), preannouncement({ announceDate: "2026-07-04" })],
      [],
    );
    expect(events).toHaveLength(1);
    expect(events[0].announceDate).toBe("2026-07-04");
  });
});

describe("deriveEarningsEvents — 快报", () => {
  it("without expectation: emits express-positive only for 盈利且同比正增长/扭亏", () => {
    const events = deriveEarningsEvents(
      [],
      [
        // 真实边界：亏损收窄（净利为负、同比为正）不是正面事件。
        express(),
        express({ code: "600001", name: "样本盈利", netProfit: 120000000, netProfitYoyPct: 30, prevYearSamePeriodNetProfit: 92307692 }),
        express({ code: "600002", name: "样本扭亏", netProfit: 5000000, netProfitYoyPct: null, prevYearSamePeriodNetProfit: -20000000 }),
        express({ code: "600003", name: "样本下滑", netProfit: 80000000, netProfitYoyPct: -12, prevYearSamePeriodNetProfit: 90909091 }),
      ],
    );
    expect(events.map((event) => `${event.code}:${event.kind}`)).toEqual(["600001:express-positive", "600002:express-positive"]);
  });

  it("with expectation: ESP verdict supersedes yoy (beat → express-beat, miss → no event)", () => {
    const expectations = new Map<string, number>([
      ["600001", 100000000],
      ["600003", 100000000],
    ]);
    const events = deriveEarningsEvents(
      [],
      [
        express({ code: "600001", name: "超预期", netProfit: 120000000, netProfitYoyPct: 30 }),
        // 同比为正但低于一致预期基准 → 不是正面事件（三级复核降级）。
        express({ code: "600003", name: "不及预期", netProfit: 80000000, netProfitYoyPct: 15 }),
      ],
      { expectedNetProfitByCode: expectations },
    );
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("express-beat");
    expect(events[0].esp).toBeCloseTo(0.2, 10);
    expect(events[0].detail).toContain("ESP");
  });

  it("dedupes multiple express rows keeping the latest announceDate", () => {
    const events = deriveEarningsEvents(
      [],
      [
        express({ code: "600001", netProfit: 1000, netProfitYoyPct: 10, announceDate: "2026-04-10" }),
        express({ code: "600001", netProfit: 1200, netProfitYoyPct: 12, announceDate: "2026-04-20" }),
      ],
    );
    expect(events).toHaveLength(1);
    expect(events[0].announceDate).toBe("2026-04-20");
  });
});

describe("toEvidenceRecords", () => {
  const events = deriveEarningsEvents([preannouncement()], []);

  it("produces P0 primary SourceRecords carrying the disclosure metadata", () => {
    const records = toEvidenceRecords(events);
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.tier).toBe("P0");
    expect(record.sourceType).toBe("primary");
    expect(record.id).toBe("P0-EM-EARN-603618-20260630-forecast-positive");
    expect(record.title).toContain("603618");
    expect(record.title).toContain("杭电股份");
    expect(record.observedAt).toBe("2026-07-04");
    expect(record.summary).toContain(PEAD_WINDOW);
    expect(record.url).toContain("603618");
    expect(record.evidenceTags).toContain("candidate-direct");
    expect(record.evidenceTags).toContain("earnings-disclosure");
    expect(record.evidenceTags).toContain("forecast-positive");
  });

  it("is consumable by extractCandidateEvidence as direct P0 primary-filing evidence", () => {
    const candidate = (code: string, name: string): Candidate => ({
      stock: {
        code,
        name,
        latestPrice: null,
        pctChange: null,
        totalMarketCap: null,
        floatMarketCap: null,
        pe: null,
        turnover: null,
        mainNetInflow: null,
        industry: "电网设备",
        region: "浙江",
        concept: "",
      },
      matchedThemes: [],
      score: 0,
      confidence: "low",
      trace: {
        priorScore: 0,
        posteriorScore: 0,
        expectedValueScore: 0,
        components: [],
        evidence: [],
        risks: [],
        coverageGaps: [],
      },
      generatedAt: "2026-07-03T00:00:00.000Z",
    });
    const records = toEvidenceRecords(events);
    const matching = extractCandidateEvidence(candidate("603618", "杭电股份"), records);
    expect(matching).toHaveLength(1);
    expect(matching[0].direct).toBe(true);
    expect(matching[0].tier).toBe("P0");
    expect(matching[0].kind).toBe("primary-filing");
    expect(matching[0].polarity).toBe("positive");
    // 公司专属披露绝不能泄漏为其它候选的证据。
    expect(extractCandidateEvidence(candidate("300750", "宁德时代"), records)).toHaveLength(0);
  });
});
