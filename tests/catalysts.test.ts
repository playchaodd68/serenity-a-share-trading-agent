import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/methodology.js";
import {
  buildCatalysts,
  classifyResolutionConfirmation,
  evaluateCatalysts,
  renderCatalysts,
} from "../src/research/catalysts.js";
import { updateWatchlistFromRun } from "../src/research/watchlist.js";
import type { AShareStock, ScreenRun } from "../src/types.js";

const ENTRY = "2026-07-01T00:00:00.000Z";

describe("catalyst ledger (positive mirror of kill criteria)", () => {
  it("builds dated catalysts across the four categories", () => {
    const catalysts = buildCatalysts({ matchedThemeLabels: ["AI 光互联"], expectationGapScore: 4, entryDate: ENTRY });
    expect(catalysts.map((item) => item.category).sort()).toEqual(["capacity", "certification", "earnings", "pricing"]);
    expect(catalysts.every((item) => item.dueDate > ENTRY)).toBe(true);
    expect(catalysts.every((item) => item.posteriorDelta < 0)).toBe(true);
  });

  it("penalizes weak expectation-gap candidates harder on the earnings catalyst", () => {
    const weak = buildCatalysts({ matchedThemeLabels: [], expectationGapScore: 3, entryDate: ENTRY });
    const strong = buildCatalysts({ matchedThemeLabels: [], expectationGapScore: 10, entryDate: ENTRY });
    expect(weak.find((item) => item.id === "cat-earnings")!.posteriorDelta).toBeLessThan(
      strong.find((item) => item.id === "cat-earnings")!.posteriorDelta,
    );
  });

  it("expired unconfirmed catalysts accumulate a posterior downgrade", () => {
    const catalysts = buildCatalysts({ matchedThemeLabels: [], expectationGapScore: 4, entryDate: ENTRY });
    const evaluation = evaluateCatalysts(catalysts, new Set(["cat-pricing"]), "2026-12-31T00:00:00.000Z");
    expect(evaluation.due.length).toBe(3);
    expect(evaluation.totalOverdueDelta).toBeLessThan(0);
    expect(evaluation.confirmedNeeded.some((item) => item.id === "cat-pricing")).toBe(false);
  });

  it("keeps future catalysts pending", () => {
    const catalysts = buildCatalysts({ matchedThemeLabels: [], expectationGapScore: 4, entryDate: ENTRY });
    const evaluation = evaluateCatalysts(catalysts, new Set(), "2026-07-02T00:00:00.000Z");
    expect(evaluation.due).toEqual([]);
    expect(evaluation.pending.length).toBe(4);
    expect(evaluation.totalOverdueDelta).toBe(0);
  });
});

describe("resolution confirmation classification (N4)", () => {
  it("separates fundamental-confirmed from unconfirmed rises", () => {
    expect(classifyResolutionConfirmation("validated", 2)).toBe("fundamental-confirmed");
    expect(classifyResolutionConfirmation("validated", 0)).toBe("unconfirmed-rise");
    expect(classifyResolutionConfirmation("falsified", 3)).toBe("not-applicable");
    expect(classifyResolutionConfirmation("inconclusive", 0)).toBe("not-applicable");
  });
});

describe("catalysts flow into trace and watchlist", () => {
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

  it("scoreCandidate registers catalysts on the trace", () => {
    const candidate = scoreCandidate(stock, []);
    expect(candidate.trace.catalysts?.length).toBe(4);
  });

  it("watchlist pins catalysts on first entry so due dates do not reset", () => {
    const candidate = scoreCandidate(stock, []);
    const run: ScreenRun = {
      runId: "screen-1",
      generatedAt: "2026-07-01T00:00:00.000Z",
      candidates: [candidate],
      totalStocksScanned: 1,
      sourceCount: 0,
    };
    const first = updateWatchlistFromRun(run);
    expect(first[0].catalysts?.length).toBe(4);
    const pinned = first[0].catalysts;

    const later = scoreCandidate(stock, []);
    const run2: ScreenRun = { ...run, runId: "screen-2", generatedAt: "2026-07-08T00:00:00.000Z", candidates: [later] };
    const second = updateWatchlistFromRun(run2, first);
    expect(second[0].catalysts).toEqual(pinned);
  });

  it("renders the ledger", () => {
    expect(renderCatalysts(buildCatalysts({ matchedThemeLabels: [], expectationGapScore: 4, entryDate: ENTRY }))).toContain("[earnings]");
    expect(renderCatalysts([])).toContain("无已登记催化剂");
  });
});
