import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildResolutionInputsFromGraveyard } from "../src/research/resolution-provider.js";
import {
  createEastmoneyPriceReturnProvider,
  createFallbackPriceReturnProvider,
} from "../src/research/eastmoney-price-provider.js";
import { resolveGraveyardOutcomes } from "../src/research/graveyard-resolution.js";
import { buildResolutionCalibration, resolveCandidates } from "../src/research/resolution.js";
import type { PriceReturnProvider } from "../src/research/resolution.js";
import { loadGraveyard, summarizeGraveyard } from "../src/research/graveyard.js";
import { writeJsonFile, readJsonFile } from "../src/utils/fs.js";
import type { CandidateResolution, GraveyardEntry } from "../src/types.js";

const NOW = "2026-07-03T00:00:00.000Z";

function buried(partial: Partial<GraveyardEntry>): GraveyardEntry {
  return {
    code: partial.code ?? "300666",
    name: partial.name ?? "江丰电子",
    reason: partial.reason ?? "below-entry-bar",
    score: partial.score ?? 21,
    confidence: partial.confidence ?? "low",
    matchedThemes: partial.matchedThemes ?? ["半导体自主可控 / 关键设备材料"],
    killedCriterionIds: partial.killedCriterionIds ?? [],
    detail: partial.detail ?? "Passed over below entry bar 63.3 at score 21.0.",
    buriedAt: partial.buriedAt ?? "2026-04-01T00:00:00.000Z",
    ...(partial.realizedAlpha != null ? { realizedAlpha: partial.realizedAlpha } : {}),
    ...(partial.outcomeLabel != null ? { outcomeLabel: partial.outcomeLabel } : {}),
  };
}

describe("buildResolutionInputsFromGraveyard", () => {
  it("selects only entries whose burial horizon has elapsed", () => {
    const entries = [
      buried({ code: "300666", buriedAt: "2026-04-01T00:00:00.000Z" }), // ~93 days: due
      buried({ code: "300604", buriedAt: "2026-06-20T00:00:00.000Z" }), // 13 days: not due
    ];
    const inputs = buildResolutionInputsFromGraveyard(entries, NOW, { horizonDays: 60 });
    expect(inputs.map((input) => input.code)).toEqual(["300666"]);
    expect(inputs[0].horizonDays).toBe(60);
    expect(inputs[0].entryDate).toBe("2026-04-01T00:00:00.000Z");
  });

  it("skips entries that already carry an outcome label", () => {
    const entries = [
      buried({ code: "300666", outcomeLabel: "validated" }),
      buried({ code: "600487" }),
    ];
    const inputs = buildResolutionInputsFromGraveyard(entries, NOW, { horizonDays: 60 });
    expect(inputs.map((input) => input.code)).toEqual(["600487"]);
  });

  it("marks origin graveyard and keeps the burial score as the (low) posterior", () => {
    const inputs = buildResolutionInputsFromGraveyard([buried({ score: 21 })], NOW, { horizonDays: 60 });
    expect(inputs[0].origin).toBe("graveyard");
    expect(inputs[0].posterior).toBe(21);
  });

  it("labels a buried entry validated on positive alpha — the system's rejection was a miss (错杀)", async () => {
    const inputs = buildResolutionInputsFromGraveyard([buried({ score: 21 })], NOW, { horizonDays: 60 });
    const resolutions = await resolveCandidates(inputs, async () => ({ stockReturn: 0.6, benchmarkReturn: 0.02 }), {
      now: NOW,
    });
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].origin).toBe("graveyard");
    expect(resolutions[0].outcomeLabel).toBe("validated");
    // probability keeps the resolution.ts definition (posterior/100 = P(跑赢基准)):
    // a buried score of 21 means the system saw only a 21% chance — validated then
    // scores as a miss with a small Brier reward direction, consistent with watchlist.
    expect(resolutions[0].probability).toBeCloseTo(0.21, 10);
  });
});

describe("createEastmoneyPriceReturnProvider", () => {
  function klinePayload(closes: Array<[string, number]>): unknown {
    return {
      rc: 0,
      data: {
        klines: closes.map(([date, close]) => `${date},1.0,${close},1.1,0.9,1000,10000,1.0,0.5,0.5,1.0`),
      },
    };
  }

  it("computes stock and benchmark window returns from push2his klines", async () => {
    const urls: string[] = [];
    const provider = createEastmoneyPriceReturnProvider({
      fetchJson: async (url) => {
        urls.push(url);
        return url.includes("secid=1.000300")
          ? klinePayload([["2026-04-01", 10], ["2026-05-31", 10.5]])
          : klinePayload([["2026-04-01", 20], ["2026-05-31", 30]]);
      },
    });
    const observation = await provider({ code: "300666", entryDate: "2026-04-01T00:00:00.000Z", horizonDays: 60 });
    expect(observation).not.toBeNull();
    expect(observation!.stockReturn).toBeCloseTo(0.5, 10);
    expect(observation!.benchmarkReturn).toBeCloseTo(0.05, 10);
    // 深市代码 300666 → secid 0.300666, 前复权日K
    expect(urls.some((url) => url.includes("secid=0.300666") && url.includes("fqt=1") && url.includes("klt=101"))).toBe(true);
  });

  it("returns null instead of throwing when the endpoint fails", async () => {
    const provider = createEastmoneyPriceReturnProvider({
      fetchJson: async () => {
        throw new Error("boom");
      },
    });
    await expect(provider({ code: "600487", entryDate: "2026-04-01", horizonDays: 60 })).resolves.toBeNull();
  });
});

describe("createFallbackPriceReturnProvider", () => {
  it("degrades to the fallback provider when the primary yields nothing", async () => {
    const primary: PriceReturnProvider = async () => null; // FFD 历史行情宕机
    const fallback: PriceReturnProvider = async () => ({ stockReturn: 0.1, benchmarkReturn: 0.02 });
    const provider = createFallbackPriceReturnProvider([primary, fallback]);
    await expect(provider({ code: "300666", entryDate: "2026-04-01", horizonDays: 60 })).resolves.toEqual({
      stockReturn: 0.1,
      benchmarkReturn: 0.02,
    });
  });

  it("prefers the primary provider and returns null when every provider fails", async () => {
    let fallbackCalls = 0;
    const primary: PriceReturnProvider = async () => ({ stockReturn: 0.3, benchmarkReturn: 0.01 });
    const fallback: PriceReturnProvider = async () => {
      fallbackCalls += 1;
      return null;
    };
    const provider = createFallbackPriceReturnProvider([primary, fallback]);
    await expect(provider({ code: "300666", entryDate: "2026-04-01", horizonDays: 60 })).resolves.toEqual({
      stockReturn: 0.3,
      benchmarkReturn: 0.01,
    });
    expect(fallbackCalls).toBe(0);

    const allDead = createFallbackPriceReturnProvider([async () => null, async () => null]);
    await expect(allDead({ code: "300666", entryDate: "2026-04-01", horizonDays: 60 })).resolves.toBeNull();
  });
});

describe("resolveGraveyardOutcomes", () => {
  let dir: string;
  let graveyardPath: string;
  let resolutionsPath: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "graveyard-resolution-"));
    graveyardPath = path.join(dir, "graveyard.json");
    resolutionsPath = path.join(dir, "resolutions.json");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("writes outcomes back so buriedHitRate stops being null and marks ledger entries with origin", async () => {
    await writeJsonFile(graveyardPath, [
      buried({ code: "300666", name: "江丰电子", buriedAt: "2026-04-01T00:00:00.000Z" }),
      buried({ code: "600487", name: "亨通光电", buriedAt: "2026-04-01T00:00:00.000Z", score: 50 }),
      buried({ code: "300308", name: "中际旭创", buriedAt: "2026-06-30T00:00:00.000Z" }), // not due
    ]);
    const provider: PriceReturnProvider = async ({ code }) =>
      code === "300666" ? { stockReturn: 0.6, benchmarkReturn: 0.02 } : { stockReturn: -0.2, benchmarkReturn: 0.02 };

    const result = await resolveGraveyardOutcomes(graveyardPath, provider, NOW, { resolutionsPath, horizonDays: 60 });

    expect(result.dueCount).toBe(2);
    expect(result.resolvedCount).toBe(2);
    // 错杀率: 1 validated of 2 decided
    expect(result.summary.buriedHitRate).toBeCloseTo(0.5, 10);

    const persisted = await loadGraveyard(graveyardPath);
    const summary = summarizeGraveyard(persisted);
    expect(summary.resolvedWithOutcome).toBe(2);
    expect(summary.buriedHitRate).toBeCloseTo(0.5, 10);
    expect(persisted.find((entry) => entry.code === "300666")?.outcomeLabel).toBe("validated");
    expect(persisted.find((entry) => entry.code === "300308")?.outcomeLabel).toBeUndefined();

    const ledger = await readJsonFile<CandidateResolution[]>(resolutionsPath, []);
    expect(ledger).toHaveLength(2);
    expect(ledger.every((item) => item.origin === "graveyard")).toBe(true);
  });

  it("appends to an existing ledger without duplicating already-resolved graveyard entries", async () => {
    await writeJsonFile(graveyardPath, [buried({ code: "300666", buriedAt: "2026-04-01T00:00:00.000Z" })]);
    const provider: PriceReturnProvider = async () => ({ stockReturn: 0.6, benchmarkReturn: 0.02 });

    const first = await resolveGraveyardOutcomes(graveyardPath, provider, NOW, { resolutionsPath, horizonDays: 60 });
    expect(first.resolvedCount).toBe(1);
    // Second run: the entry now carries an outcomeLabel, so nothing is due.
    const second = await resolveGraveyardOutcomes(graveyardPath, provider, NOW, { resolutionsPath, horizonDays: 60 });
    expect(second.dueCount).toBe(0);
    expect(second.resolvedCount).toBe(0);

    const ledger = await readJsonFile<CandidateResolution[]>(resolutionsPath, []);
    expect(ledger).toHaveLength(1);
  });

  it("keeps a pre-existing watchlist resolution ledger intact when merging", async () => {
    const watchlistResolution: CandidateResolution = {
      code: "300308",
      name: "中际旭创",
      posterior: 93.7,
      probability: 0.937,
      confidence: "high",
      evidenceTier: "P0-anchored",
      entryDate: "2026-05-01",
      horizonDays: 60,
      stockReturn: -0.042,
      benchmarkReturn: 0.01,
      realizedAlpha: -0.052,
      outcome: 0,
      outcomeLabel: "falsified",
      brier: 0.878,
      resolvedAt: NOW,
    };
    await writeJsonFile(resolutionsPath, [watchlistResolution]);
    await writeJsonFile(graveyardPath, [buried({ code: "300666", buriedAt: "2026-04-01T00:00:00.000Z" })]);

    const provider: PriceReturnProvider = async () => ({ stockReturn: 0.6, benchmarkReturn: 0.02 });
    await resolveGraveyardOutcomes(graveyardPath, provider, NOW, { resolutionsPath, horizonDays: 60 });

    const ledger = await readJsonFile<CandidateResolution[]>(resolutionsPath, []);
    expect(ledger).toHaveLength(2);
    expect(ledger.filter((item) => item.origin === "graveyard")).toHaveLength(1);
    expect(ledger.find((item) => item.code === "300308")?.origin).toBeUndefined();
  });
});

describe("calibration isolation", () => {
  it("excludes graveyard-origin resolutions so 错杀 verification cannot distort watchlist calibration", () => {
    const base: CandidateResolution = {
      code: "300308",
      name: "中际旭创",
      posterior: 80,
      probability: 0.8,
      confidence: "high",
      evidenceTier: "P0-anchored",
      entryDate: "2026-05-01",
      horizonDays: 60,
      stockReturn: 0.2,
      benchmarkReturn: 0.02,
      realizedAlpha: 0.18,
      outcome: 1,
      outcomeLabel: "validated",
      brier: 0.04,
      resolvedAt: NOW,
    };
    const graveyardResolution: CandidateResolution = {
      ...base,
      code: "300666",
      name: "江丰电子",
      origin: "graveyard",
      posterior: 21,
      probability: 0.21,
      brier: (0.21 - 1) ** 2,
    };
    const report = buildResolutionCalibration([base, graveyardResolution], NOW);
    expect(report.resolved).toBe(1);
    expect(report.brierMean).toBeCloseTo(0.04, 10);
  });
});
