import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPLETENESS_THRESHOLDS,
  evaluateCompleteness,
  renderCompleteness,
} from "../src/validation/completeness-gate.js";
import type { Candidate, HotThemeDowngrade, KillCriterion, ScreenRun } from "../src/types.js";

function makeKillCriterion(): KillCriterion {
  return {
    id: "kc-1",
    category: "evidence-gap",
    trigger: "30 天内未出现候选 P0 直接证据",
    dueDate: "2026-08-01T00:00:00.000Z",
    sourceCheck: "巨潮公告 + 交易所互动平台",
    posteriorDelta: -2,
  };
}

function makeCandidate(
  code: string,
  confidence: Candidate["confidence"],
  killCriteria?: KillCriterion[],
): Candidate {
  return {
    stock: {
      code,
      name: `测试股${code}`,
      latestPrice: 10,
      pctChange: 1,
      totalMarketCap: 100_0000_0000,
      floatMarketCap: 80_0000_0000,
      pe: 30,
      turnover: 2,
      mainNetInflow: 0,
      industry: "半导体",
      region: "上海",
      concept: "先进封装",
    },
    matchedThemes: [{ themeId: "adv-pkg", label: "先进封装", keywords: ["CoWoS"] }],
    score: 7,
    confidence,
    trace: {
      priorScore: 5,
      posteriorScore: 7,
      expectedValueScore: 6,
      components: [],
      evidence: [],
      risks: [],
      coverageGaps: [],
      ...(killCriteria ? { killCriteria } : {}),
    },
    generatedAt: "2026-07-01T00:00:00.000Z",
  };
}

function makeDowngrade(): HotThemeDowngrade {
  return {
    themeId: "hot-theme",
    label: "热门主题",
    heatScore: 9,
    avgTurnover: 15,
    avgPctChange: 6,
    candidateCount: 4,
    hasStrongEvidence: false,
    downgraded: true,
    reason: "纯情绪驱动，无新增 P0/P1 证据",
  };
}

function makeRun(overrides: Partial<ScreenRun> = {}): ScreenRun {
  return {
    runId: "run-1",
    generatedAt: "2026-07-01T00:00:00.000Z",
    candidates: [
      makeCandidate("600001", "high", [makeKillCriterion()]),
      makeCandidate("600002", "medium", [makeKillCriterion()]),
      makeCandidate("600003", "low"),
    ],
    totalStocksScanned: 5000,
    sourceCount: 8,
    hotThemeDowngrades: [makeDowngrade()],
    ...overrides,
  };
}

describe("evaluateCompleteness", () => {
  it("uses the documented default thresholds", () => {
    expect(DEFAULT_COMPLETENESS_THRESHOLDS).toEqual({
      minCandidates: 3,
      minSources: 5,
      requireDowngradeSlot: true,
      requireKillCriteria: true,
    });
  });

  it("passes a run that satisfies every rule", () => {
    const result = evaluateCompleteness(makeRun());
    expect(result.passed).toBe(true);
    expect(result.label).toBe("complete");
    expect(result.issues).toEqual([]);
  });

  it("fails when candidate count is below minCandidates", () => {
    const run = makeRun({
      candidates: [
        makeCandidate("600001", "high", [makeKillCriterion()]),
        makeCandidate("600002", "low"),
      ],
    });
    const result = evaluateCompleteness(run);
    expect(result.passed).toBe(false);
    expect(result.label).toBe("initial-pass");
    expect(result.issues.some((issue) => issue.rule === "min-candidates")).toBe(true);
  });

  it("passes candidate rule exactly at the minCandidates boundary", () => {
    const result = evaluateCompleteness(makeRun());
    expect(makeRun().candidates.length).toBe(DEFAULT_COMPLETENESS_THRESHOLDS.minCandidates);
    expect(result.issues.some((issue) => issue.rule === "min-candidates")).toBe(false);
  });

  it("fails when sourceCount is below minSources and passes at the boundary", () => {
    const failed = evaluateCompleteness(makeRun({ sourceCount: 4 }));
    expect(failed.passed).toBe(false);
    expect(failed.issues.some((issue) => issue.rule === "min-sources")).toBe(true);

    const boundary = evaluateCompleteness(makeRun({ sourceCount: 5 }));
    expect(boundary.issues.some((issue) => issue.rule === "min-sources")).toBe(false);
  });

  it("fails when the hot-theme downgrade slot is missing or empty", () => {
    const missing = evaluateCompleteness(makeRun({ hotThemeDowngrades: undefined }));
    expect(missing.issues.some((issue) => issue.rule === "downgrade-slot")).toBe(true);

    const empty = evaluateCompleteness(makeRun({ hotThemeDowngrades: [] }));
    expect(empty.issues.some((issue) => issue.rule === "downgrade-slot")).toBe(true);
  });

  it("skips the downgrade-slot rule when requireDowngradeSlot is false", () => {
    const result = evaluateCompleteness(makeRun({ hotThemeDowngrades: [] }), {
      ...DEFAULT_COMPLETENESS_THRESHOLDS,
      requireDowngradeSlot: false,
    });
    expect(result.issues.some((issue) => issue.rule === "downgrade-slot")).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("fails when a medium/high candidate has no kill criteria", () => {
    const run = makeRun({
      candidates: [
        makeCandidate("600001", "high"),
        makeCandidate("600002", "medium", [makeKillCriterion()]),
        makeCandidate("600003", "low"),
      ],
    });
    const result = evaluateCompleteness(run);
    const killIssues = result.issues.filter((issue) => issue.rule === "kill-criteria");
    expect(killIssues).toHaveLength(1);
    expect(killIssues[0].detail).toContain("600001");
  });

  it("does not require kill criteria for low-confidence candidates", () => {
    const run = makeRun({
      candidates: [
        makeCandidate("600001", "high", [makeKillCriterion()]),
        makeCandidate("600002", "medium", [makeKillCriterion()]),
        makeCandidate("600003", "low"),
      ],
    });
    const result = evaluateCompleteness(run);
    expect(result.issues.some((issue) => issue.rule === "kill-criteria")).toBe(false);
  });

  it("skips the kill-criteria rule when requireKillCriteria is false", () => {
    const run = makeRun({
      candidates: [
        makeCandidate("600001", "high"),
        makeCandidate("600002", "medium"),
        makeCandidate("600003", "low"),
      ],
    });
    const result = evaluateCompleteness(run, {
      ...DEFAULT_COMPLETENESS_THRESHOLDS,
      requireKillCriteria: false,
    });
    expect(result.issues.some((issue) => issue.rule === "kill-criteria")).toBe(false);
    expect(result.passed).toBe(true);
  });

  it("collects every failed rule at once", () => {
    const run = makeRun({
      candidates: [makeCandidate("600001", "high")],
      sourceCount: 1,
      hotThemeDowngrades: [],
    });
    const result = evaluateCompleteness(run);
    const rules = result.issues.map((issue) => issue.rule);
    expect(rules).toContain("min-candidates");
    expect(rules).toContain("min-sources");
    expect(rules).toContain("downgrade-slot");
    expect(rules).toContain("kill-criteria");
  });
});

describe("renderCompleteness", () => {
  it("marks a passed run as complete without the initial-pass warning", () => {
    const text = renderCompleteness(evaluateCompleteness(makeRun()));
    expect(text).toContain("完成度校验通过");
    expect(text).not.toContain("这是初筛");
  });

  it("marks a failed run with the mandatory 这是初筛 warning and lists each issue", () => {
    const result = evaluateCompleteness(makeRun({ sourceCount: 2, hotThemeDowngrades: [] }));
    const text = renderCompleteness(result);
    expect(text).toContain("这是初筛");
    for (const issue of result.issues) {
      expect(text).toContain(issue.detail);
    }
  });
});
