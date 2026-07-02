import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import { buildPositionOverlay, renderPositionOverlay } from "../src/pipeline/position-overlay.js";
import type { Portfolio } from "../src/portfolio/portfolio.js";
import type { BearCaseRecord } from "../src/research/debate/bear-case.js";
import type { AShareStock, GraveyardEntry, ScreenRun, WatchlistEntry } from "../src/types.js";

const stock: AShareStock = {
  code: "300308",
  name: "测试光模块",
  latestPrice: 120,
  pctChange: 2,
  totalMarketCap: 130_000_000_000,
  floatMarketCap: 110_000_000_000,
  pe: 42,
  turnover: 3,
  mainNetInflow: 10_000_000,
  industry: "通信设备",
  region: "测试",
  concept: "CPO 光模块 硅光",
};

function makeRun(): ScreenRun {
  const candidate = scoreCandidate(stock, []);
  return {
    runId: "screen-test",
    generatedAt: "2026-07-02T00:00:00.000Z",
    candidates: [candidate],
    totalStocksScanned: 1,
    sourceCount: 0,
  };
}

const portfolio: Portfolio = {
  updatedAt: "2026-07-02T00:00:00.000Z",
  positions: [
    { code: "300308", name: "测试光模块", weight: 0.4 },
    { code: "600000", name: "场外持仓", weight: 0.1 },
  ],
};

describe("position overlay (read-only mapping)", () => {
  it("maps holdings onto blind-channel conclusions without mutating them", () => {
    const run = makeRun();
    const before = JSON.stringify(run);
    const report = buildPositionOverlay({
      portfolio,
      latestRun: run,
      watchlist: [],
      bearCases: {},
      graveyard: [],
      now: "2026-07-02T01:00:00.000Z",
    });
    expect(JSON.stringify(run)).toBe(before);
    expect(report.positionCount).toBe(2);
    expect(report.entries[0].inLatestRun).toBe(true);
    expect(report.entries[1].inLatestRun).toBe(false);
    expect(report.disclaimer).toContain("不修改任何结论");
  });

  it("flags conflicts: missing bear pass, graveyard record, downgraded watchlist entry", () => {
    const run = makeRun();
    const watchlist: WatchlistEntry[] = [
      {
        code: "300308",
        name: "测试光模块",
        status: "downgraded",
        score: 30,
        confidence: "low",
        firstSeenAt: "2026-06-01T00:00:00.000Z",
        lastSeenAt: "2026-07-01T00:00:00.000Z",
        nextReviewAt: "2026-07-08T00:00:00.000Z",
        evidenceState: { hasCandidateP0: false, directEvidenceCount: 0, corroboratingEvidenceCount: 0, riskEvidenceCount: 0 },
        coverageGaps: [],
        nextActions: [],
        events: [],
        killCriteria: [
          {
            id: "kc-1",
            category: "evidence-gap",
            trigger: "无 P0",
            dueDate: "2026-06-15T00:00:00.000Z",
            sourceCheck: "CNINFO",
            posteriorDelta: -15,
          },
        ],
      },
    ];
    const graveyard: GraveyardEntry[] = [
      {
        code: "300308",
        name: "测试光模块",
        reason: "downgraded",
        score: 30,
        confidence: "low",
        matchedThemes: [],
        killedCriterionIds: [],
        detail: "曾被降级",
        buriedAt: "2026-06-20T00:00:00.000Z",
      },
    ];
    const report = buildPositionOverlay({
      portfolio,
      latestRun: run,
      watchlist,
      bearCases: {},
      graveyard,
      now: "2026-07-02T01:00:00.000Z",
    });
    const entry = report.entries[0];
    expect(entry.bearCaseStatus).toBe("missing");
    expect(entry.buried).toBe(true);
    expect(entry.overdueKillCriteria).toBe(1);
    const conflictText = entry.conflicts.join("\n");
    expect(conflictText).toContain("降级");
    expect(conflictText).toContain("墓地");
    expect(conflictText).toContain("kill criteria 已到期");
    expect(conflictText).toContain("research:bear");
    expect(report.conflictCount).toBeGreaterThanOrEqual(4);
  });

  it("computes industry concentration from weights", () => {
    const report = buildPositionOverlay({
      portfolio,
      latestRun: makeRun(),
      watchlist: [],
      bearCases: {},
      graveyard: [],
      now: "2026-07-02T01:00:00.000Z",
    });
    const top = report.concentration[0];
    expect(top.industry).toBe("通信设备");
    expect(top.weight).toBeCloseTo(0.4);
  });

  it("uses a failed bear record as failed, not completed", () => {
    const failed: BearCaseRecord = {
      code: "300308",
      name: "测试光模块",
      generatedAt: "2026-07-01T00:00:00.000Z",
      model: "fake",
      status: "parse-failed",
      report: null,
    };
    const report = buildPositionOverlay({
      portfolio,
      latestRun: makeRun(),
      watchlist: [],
      bearCases: { "300308": failed },
      graveyard: [],
      now: "2026-07-02T01:00:00.000Z",
    });
    expect(report.entries[0].bearCaseStatus).toBe("failed");
  });

  it("renders a readable report with the firewall disclaimer", () => {
    const rendered = renderPositionOverlay(
      buildPositionOverlay({
        portfolio,
        latestRun: makeRun(),
        watchlist: [],
        bearCases: {},
        graveyard: [],
        now: "2026-07-02T01:00:00.000Z",
      }),
    );
    expect(rendered).toContain("持仓 overlay");
    expect(rendered).toContain("行业集中度");
    expect(rendered).toContain("不修改任何结论");
  });
});
