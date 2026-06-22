import { describe, expect, it } from "vitest";
import {
  buildHealthRollup,
  summarizeEvals,
  summarizeFfdSmoke,
  summarizeLatestRun,
  summarizeWatchlist,
  type AgentStatusSnapshot,
} from "../src/dashboard/status.js";
import type { Candidate, ScreenRun, WatchlistEntry } from "../src/types.js";
import type { FfdSmokeRun } from "../src/research/ffd-smoke.js";

const NOW = new Date("2026-06-22T08:00:00.000Z").getTime();

function isoHoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString();
}

function candidate(code: string, score: number, confidence: Candidate["confidence"]): Candidate {
  return {
    stock: {
      code,
      name: `公司${code}`,
      latestPrice: 10,
      pctChange: 1,
      totalMarketCap: 1_000_000_000,
      floatMarketCap: 1_000_000_000,
      pe: 20,
      turnover: 1,
      mainNetInflow: 0,
      industry: "半导体",
      region: "测试板块",
      concept: "测试",
    },
    matchedThemes: [],
    score,
    confidence,
    generatedAt: isoHoursAgo(2),
    trace: {
      priorScore: score,
      posteriorScore: score,
      expectedValueScore: score,
      components: [],
      evidence: [],
      risks: [],
      coverageGaps: [],
    },
  };
}

function watchlistEntry(code: string, status: WatchlistEntry["status"], nextReviewAt: string, hasCandidateP0 = false): WatchlistEntry {
  return {
    code,
    name: `公司${code}`,
    status,
    score: 60,
    confidence: "medium",
    firstSeenAt: isoHoursAgo(48),
    lastSeenAt: isoHoursAgo(2),
    nextReviewAt,
    evidenceState: { hasCandidateP0, directEvidenceCount: 1, corroboratingEvidenceCount: 1, riskEvidenceCount: 0 },
    coverageGaps: [],
    nextActions: [],
    events: [{ at: isoHoursAgo(2), type: "updated", detail: "seen" }],
  };
}

function healthyPartial(): Omit<AgentStatusSnapshot, "health"> {
  return {
    generatedAt: new Date(NOW).toISOString(),
    model: { provider: "deepseek", name: "deepseek-v4-pro" },
    doctor: { ok: true, generatedAt: new Date(NOW).toISOString(), counts: { ok: 3, total: 3, info: 1, warning: 0, error: 0 }, failing: [], checks: [] },
    latestRun: {
      runId: "screen-x",
      generatedAt: isoHoursAgo(2),
      ageHours: 2,
      stale: false,
      totalStocksScanned: 100,
      sourceCount: 10,
      candidateCount: 3,
      topCandidates: [],
    },
    watchlist: { total: 5, statusCounts: { validated: 1, investigating: 2, "evidence-needed": 1, downgraded: 1, archived: 0 }, withCandidateP0: 1, ageHours: 2, stale: false, upcomingReviews: [] },
    evals: { passed: 5, total: 5, failing: [] },
    ffdSmoke: { generatedAt: isoHoursAgo(1), ok: true, ageHours: 1, stale: false, statusCounts: { ok: 8 }, probes: [] },
    freshness: [],
    history: [],
    warnings: [],
  };
}

describe("summarizeWatchlist", () => {
  it("counts statuses and surfaces overdue upcoming reviews first", () => {
    const entries: WatchlistEntry[] = [
      watchlistEntry("300001", "validated", isoHoursAgo(-72), true),
      watchlistEntry("300002", "investigating", isoHoursAgo(24)),
      watchlistEntry("300003", "archived", isoHoursAgo(-100)),
    ];
    const result = summarizeWatchlist(entries, NOW);
    expect(result.total).toBe(3);
    expect(result.statusCounts.validated).toBe(1);
    expect(result.statusCounts.archived).toBe(1);
    expect(result.withCandidateP0).toBe(1);
    // archived entries are excluded from upcoming reviews
    expect(result.upcomingReviews.map((review) => review.code)).toEqual(["300002", "300001"]);
    expect(result.upcomingReviews[0]).toMatchObject({ code: "300002", overdue: true });
    expect(result.stale).toBe(false);
  });

  it("marks an empty watchlist as stale", () => {
    const result = summarizeWatchlist([], NOW);
    expect(result.total).toBe(0);
    expect(result.stale).toBe(true);
  });
});

describe("summarizeLatestRun", () => {
  it("flags stale runs and maps top candidates", () => {
    const run: ScreenRun = {
      runId: "screen-2026",
      generatedAt: isoHoursAgo(48),
      totalStocksScanned: 800,
      sourceCount: 12,
      candidates: [candidate("300308", 72, "high"), candidate("688072", 64, "medium")],
      quantSummary: {
        strategy: "Serenity Mainline Quant Overlay",
        generatedAt: isoHoursAgo(48),
        noCrowdingPenalty: true,
        riskMode: "Rebalance",
        bucketCounts: { core: 1, watchlist: 1, observe: 0, reject: 0 },
        industryTiers: [{ industryKey: "半导体", score: 80, tier: "A", candidateCount: 2 }],
        notes: [],
      },
    };
    const result = summarizeLatestRun(run, NOW);
    expect(result?.stale).toBe(true);
    expect(result?.candidateCount).toBe(2);
    expect(result?.topCandidates[0]).toMatchObject({ rank: 1, code: "300308", confidence: "high" });
    expect(result?.quant?.riskMode).toBe("Rebalance");
  });

  it("returns undefined when there is no run", () => {
    expect(summarizeLatestRun(null, NOW)).toBeUndefined();
  });
});

describe("summarizeEvals and summarizeFfdSmoke", () => {
  it("captures failing evals", () => {
    const result = summarizeEvals([
      { id: "leverage", prompt: "p", expectedPolicy: "refuse-execution-guidance", passed: true, detail: "ok" },
      { id: "all-in", prompt: "p", expectedPolicy: "refuse-execution-guidance", passed: false, detail: "missing" },
    ]);
    expect(result).toMatchObject({ passed: 1, total: 2 });
    expect(result?.failing).toEqual([{ id: "all-in", detail: "missing" }]);
  });

  it("summarizes ffd smoke status counts", () => {
    const run: FfdSmokeRun = {
      generatedAt: isoHoursAgo(30),
      ok: false,
      results: [
        { id: "mcp-health", label: "MCP health", toolName: "ffd_health", required: true, status: "ok", ok: true, preview: "" },
        { id: "news", label: "News", toolName: "ffd_news_search", required: true, status: "api_key_disabled", ok: false, preview: "" },
      ],
    };
    const result = summarizeFfdSmoke(run, NOW);
    expect(result?.ok).toBe(false);
    expect(result?.stale).toBe(true);
    expect(result?.statusCounts).toMatchObject({ ok: 1, api_key_disabled: 1 });
  });
});

describe("buildHealthRollup", () => {
  it("reports ok when all checks pass", () => {
    expect(buildHealthRollup(healthyPartial()).level).toBe("ok");
  });

  it("escalates to error when a safety eval fails", () => {
    const partial = healthyPartial();
    const rollup = buildHealthRollup({ ...partial, evals: { passed: 4, total: 5, failing: [{ id: "all-in", detail: "missing" }] } });
    expect(rollup.level).toBe("error");
    expect(rollup.reasons.join("")).toContain("安全评测");
  });

  it("escalates to error on a severity=error doctor failure", () => {
    const partial = healthyPartial();
    const rollup = buildHealthRollup({
      ...partial,
      doctor: { ...partial.doctor, ok: false, failing: [{ name: "model-config", ok: false, severity: "error", detail: "missing" }] },
    });
    expect(rollup.level).toBe("error");
  });

  it("warns (not errors) on a stale latest run", () => {
    const partial = healthyPartial();
    const rollup = buildHealthRollup({ ...partial, latestRun: { ...partial.latestRun!, stale: true, ageHours: 50 } });
    expect(rollup.level).toBe("warn");
  });
});
