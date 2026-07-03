import { describe, expect, it } from "vitest";
import {
  PORTFOLIO_SYNC_NOTE,
  syncPortfolioIntoWatchlist,
} from "../src/pipeline/portfolio-watchlist-sync.js";
import type { Portfolio } from "../src/portfolio/portfolio.js";
import type { WatchlistEntry } from "../src/types.js";

const NOW = "2026-07-03T00:00:00.000Z";

function makePortfolio(codes: Array<{ code: string; name?: string }>): Portfolio {
  return { updatedAt: NOW, positions: codes };
}

function makeEntry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    code: "300308",
    name: "测试光模块",
    status: "investigating",
    score: 62.5,
    confidence: "medium",
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    lastSeenAt: "2026-07-01T00:00:00.000Z",
    nextReviewAt: "2026-07-08T00:00:00.000Z",
    evidenceState: { hasCandidateP0: true, directEvidenceCount: 3, corroboratingEvidenceCount: 2, riskEvidenceCount: 1 },
    coverageGaps: ["缺产能爬坡数据"],
    nextActions: ["核对季度产能"],
    events: [{ at: "2026-06-01T00:00:00.000Z", type: "created", detail: "Entered watchlist at score 62.5." }],
    killCriteria: [],
    catalysts: [],
    ...overrides,
  };
}

describe("syncPortfolioIntoWatchlist (holdings forced into research coverage)", () => {
  it("creates a forced entry for a holding missing from the watchlist", () => {
    const result = syncPortfolioIntoWatchlist(makePortfolio([{ code: "300398", name: "江丰电子" }]), [], NOW);

    expect(result.changed).toBe(true);
    expect(result.added).toEqual([{ code: "300398", name: "江丰电子" }]);
    expect(result.reactivated).toEqual([]);
    expect(result.watchlist).toHaveLength(1);

    const entry = result.watchlist[0];
    expect(entry.code).toBe("300398");
    expect(entry.status).toBe("evidence-needed");
    expect(entry.nextReviewAt).toBe("2026-07-06T00:00:00.000Z");
    expect(entry.score).toBe(0);
    expect(entry.confidence).toBe("low");
    expect(entry.evidenceState).toEqual({
      hasCandidateP0: false,
      directEvidenceCount: 0,
      corroboratingEvidenceCount: 0,
      riskEvidenceCount: 0,
    });
    expect(entry.nextActions.join("\n")).toContain("portfolio-sync");
    const created = entry.events.find((event) => event.type === "created");
    expect(created?.detail).toBe(PORTFOLIO_SYNC_NOTE);
    expect(created?.detail).toContain("持仓强制跟踪");
  });

  it("leaves an existing healthy entry completely untouched", () => {
    const existing = makeEntry({ nextReviewAt: "2026-07-06T00:00:00.000Z" });
    const watchlist = [existing];
    const before = JSON.stringify(watchlist);

    const result = syncPortfolioIntoWatchlist(makePortfolio([{ code: "300308" }]), watchlist, NOW);

    expect(result.changed).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.reactivated).toEqual([]);
    expect(result.watchlist).toBe(watchlist);
    expect(JSON.stringify(result.watchlist)).toBe(before);
  });

  it("reactivates an archived holding without erasing its research data", () => {
    const archived = makeEntry({ status: "archived", nextReviewAt: "2026-07-05T00:00:00.000Z" });

    const result = syncPortfolioIntoWatchlist(makePortfolio([{ code: "300308" }]), [archived], NOW);

    expect(result.changed).toBe(true);
    expect(result.reactivated).toEqual([{ code: "300308", name: "测试光模块" }]);
    const entry = result.watchlist[0];
    // Has direct evidence + candidate P0, so "研究中" maps to investigating, not evidence-needed.
    expect(entry.status).toBe("investigating");
    expect(entry.score).toBe(62.5);
    expect(entry.coverageGaps).toEqual(["缺产能爬坡数据"]);
    expect(entry.evidenceState.directEvidenceCount).toBe(3);
    const statusEvent = entry.events.at(-1);
    expect(statusEvent?.type).toBe("status-changed");
    expect(statusEvent?.detail).toContain("archived -> investigating");
    expect(statusEvent?.detail).toContain("portfolio-sync");
    // Original input must not be mutated.
    expect(archived.status).toBe("archived");
  });

  it("reactivates an archived holding with no evidence back to evidence-needed", () => {
    const archived = makeEntry({
      status: "archived",
      nextReviewAt: "2026-07-05T00:00:00.000Z",
      evidenceState: { hasCandidateP0: false, directEvidenceCount: 0, corroboratingEvidenceCount: 0, riskEvidenceCount: 0 },
    });

    const result = syncPortfolioIntoWatchlist(makePortfolio([{ code: "300308" }]), [archived], NOW);

    expect(result.watchlist[0].status).toBe("evidence-needed");
  });

  // 2026-07-03 复盘回归：downgradeMissing 把不在本轮 screen 的持仓打成 downgraded，
  // 下一步 updateGraveyard 会以 buryDowngraded 入墓并在面板渲染成红色"主动否决"。
  // sync 在 bury 之前运行，必须把 downgraded 的持仓复活回强制跟踪档，切断该循环。
  it("reactivates a downgraded holding with no evidence back to evidence-needed so it cannot be buried", () => {
    const downgraded = makeEntry({
      status: "downgraded",
      nextReviewAt: "2026-07-05T00:00:00.000Z",
      evidenceState: { hasCandidateP0: false, directEvidenceCount: 0, corroboratingEvidenceCount: 0, riskEvidenceCount: 0 },
    });

    const result = syncPortfolioIntoWatchlist(makePortfolio([{ code: "300308" }]), [downgraded], NOW);

    expect(result.changed).toBe(true);
    expect(result.reactivated).toEqual([{ code: "300308", name: "测试光模块" }]);
    const entry = result.watchlist[0];
    expect(entry.status).toBe("evidence-needed");
    const statusEvent = entry.events.at(-1);
    expect(statusEvent?.type).toBe("status-changed");
    expect(statusEvent?.detail).toContain("downgraded -> evidence-needed");
    expect(statusEvent?.detail).toContain("portfolio-sync");
    // Original input must not be mutated.
    expect(downgraded.status).toBe("downgraded");
  });

  it("reactivates a downgraded holding with research evidence back to investigating", () => {
    const downgraded = makeEntry({ status: "downgraded", nextReviewAt: "2026-07-05T00:00:00.000Z" });

    const result = syncPortfolioIntoWatchlist(makePortfolio([{ code: "300308" }]), [downgraded], NOW);

    expect(result.watchlist[0].status).toBe("investigating");
    expect(result.reactivated).toEqual([{ code: "300308", name: "测试光模块" }]);
  });

  it("tightens nextReviewAt to now+7d when the existing review is scheduled later", () => {
    const lax = makeEntry({ nextReviewAt: "2026-08-01T00:00:00.000Z" });

    const result = syncPortfolioIntoWatchlist(makePortfolio([{ code: "300308" }]), [lax], NOW);

    expect(result.changed).toBe(true);
    const entry = result.watchlist[0];
    expect(entry.nextReviewAt).toBe("2026-07-10T00:00:00.000Z");
    const reviewEvent = entry.events.at(-1);
    expect(reviewEvent?.type).toBe("review-scheduled");
    expect(reviewEvent?.detail).toContain("portfolio-sync");
    // Research data untouched by the tightening.
    expect(entry.status).toBe("investigating");
    expect(entry.score).toBe(62.5);
    // No entries were added or reactivated, only tightened.
    expect(result.added).toEqual([]);
    expect(result.reactivated).toEqual([]);
  });

  it("does not touch a review already scheduled within now+7d", () => {
    const tight = makeEntry({ nextReviewAt: "2026-07-05T00:00:00.000Z" });

    const result = syncPortfolioIntoWatchlist(makePortfolio([{ code: "300308" }]), [tight], NOW);

    expect(result.changed).toBe(false);
    expect(result.watchlist[0].nextReviewAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("is idempotent: the second run reports changed=false and identical data", () => {
    const portfolio = makePortfolio([
      { code: "300398", name: "江丰电子" },
      { code: "300308", name: "测试光模块" },
    ]);
    const archived = makeEntry({ status: "archived", nextReviewAt: "2026-09-01T00:00:00.000Z" });

    const first = syncPortfolioIntoWatchlist(portfolio, [archived], NOW);
    expect(first.changed).toBe(true);

    const second = syncPortfolioIntoWatchlist(portfolio, first.watchlist, NOW);
    expect(second.changed).toBe(false);
    expect(second.added).toEqual([]);
    expect(second.reactivated).toEqual([]);
    expect(second.watchlist).toBe(first.watchlist);
  });

  it("returns the watchlist untouched for an empty portfolio", () => {
    const watchlist = [makeEntry()];

    const result = syncPortfolioIntoWatchlist(makePortfolio([]), watchlist, NOW);

    expect(result.changed).toBe(false);
    expect(result.added).toEqual([]);
    expect(result.reactivated).toEqual([]);
    expect(result.watchlist).toBe(watchlist);
  });

  it("never mutates the input watchlist or its entries", () => {
    const lax = makeEntry({ nextReviewAt: "2026-08-01T00:00:00.000Z" });
    const watchlist = [lax];
    const before = JSON.stringify(watchlist);

    syncPortfolioIntoWatchlist(makePortfolio([{ code: "300308" }, { code: "300398", name: "江丰电子" }]), watchlist, NOW);

    expect(JSON.stringify(watchlist)).toBe(before);
    expect(watchlist).toHaveLength(1);
  });
});
