import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLadderSnapshot,
  collectPoolPages,
  computeBrokenRate,
  fetchLimitUpLadder,
  formatLadderReport,
  mapZtPoolRow,
  normalizeLadderDate,
  parseZtPoolResponse,
} from "../src/connectors/limit-up-ladder.js";

// Trimmed live fixture captured via curl on 2026-07-02 from
// https://push2ex.eastmoney.com/getTopicZTPool (real field values, subset of pool rows).
const ZT_POOL_FIXTURE = {
  rc: 0,
  data: {
    tc: 93,
    qdate: 20260702,
    pool: [
      { c: "000595", m: 0, n: "宝塔实业", p: 5670, zdp: 10.097086906433106, amount: 8173305, hs: 0.1265965849161148, lbc: 1, fbt: 92500, lbt: 92500, fund: 135255582, zbc: 0, hybk: "电力", zttj: { days: 1, ct: 1 } },
      { c: "002808", m: 0, n: "恒久退", p: 250, zdp: 8.69565200805664, amount: 5367795, hs: 11.550288200378418, lbc: 3, fbt: 92500, lbt: 143957, fund: 19008, zbc: 11, hybk: "光学光电", zttj: { days: 3, ct: 3 } },
      { c: "600641", m: 1, n: "先导基电", p: 48240, zdp: 10.011402130126953, amount: 3282307872, hs: 7.3817243576049805, lbc: 3, fbt: 92503, lbt: 93651, fund: 460947044, zbc: 2, hybk: "半导体", zttj: { days: 3, ct: 3 } },
      { c: "000566", m: 0, n: "海南海药", p: 6040, zdp: 10.018214225769043, amount: 745451408, hs: 9.530638694763184, lbc: 4, fbt: 93000, lbt: 101600, fund: 120544483, zbc: 1, hybk: "化学制药", zttj: { days: 8, ct: 6 } },
    ],
  },
};

describe("ZT pool parsing", () => {
  it("parses the live fixture into qdate, total, and rows", () => {
    const parsed = parseZtPoolResponse(ZT_POOL_FIXTURE);
    expect(parsed.qdate).toBe(20260702);
    expect(parsed.total).toBe(93);
    expect(parsed.rows).toHaveLength(4);
  });

  it("tolerates null data and empty pool (non-trading day)", () => {
    expect(parseZtPoolResponse({ rc: 0, data: null })).toEqual({ qdate: null, total: 0, rows: [] });
    const empty = parseZtPoolResponse({ rc: 0, data: { tc: 0, qdate: 20260702, pool: [] } });
    expect(empty.total).toBe(0);
    expect(empty.rows).toEqual([]);
  });

  it("throws on rc≠0 error responses instead of treating them as an empty pool", () => {
    expect(() => parseZtPoolResponse({ rc: 1, data: null })).toThrow(/rc=1/);
    expect(() => parseZtPoolResponse({ rc: -1, data: null })).toThrow(/rc=-1/);
  });
});

describe("ZT pool row mapping", () => {
  it("maps real fields into a typed LimitUpStock", () => {
    const parsed = parseZtPoolResponse(ZT_POOL_FIXTURE);
    const stock = mapZtPoolRow(parsed.rows[1]);
    expect(stock.code).toBe("002808");
    expect(stock.name).toBe("恒久退");
    expect(stock.industry).toBe("光学光电");
    expect(stock.height).toBe(3);
    expect(stock.sealAmount).toBe(19008);
    expect(stock.brokenCount).toBe(11);
    expect(stock.firstSealTime).toBe("09:25");
  });

  it("tolerates missing/dirty fields without failing the pool", () => {
    const stock = mapZtPoolRow({ c: "600000", n: "某停牌股", fbt: "-", fund: "-", lbc: null, zbc: "-", hybk: null });
    expect(stock.height).toBe(1);
    expect(stock.sealAmount).toBeNull();
    expect(stock.brokenCount).toBe(0);
    expect(stock.firstSealTime).toBe("");
    expect(stock.industry).toBe("");
  });
});

describe("ladder grouping and stats", () => {
  it("groups stocks by height in descending tiers", () => {
    const stocks = parseZtPoolResponse(ZT_POOL_FIXTURE).rows.map(mapZtPoolRow);
    const snapshot = buildLadderSnapshot(stocks, 40, 20260702);
    expect(snapshot.date).toBe("2026-07-02");
    expect(snapshot.ladder.map((tier) => tier.height)).toEqual([4, 3, 1]);
    expect(snapshot.ladder[0].stocks.map((stock) => stock.code)).toEqual(["000566"]);
    expect(snapshot.ladder[1].stocks.map((stock) => stock.code)).toEqual(["002808", "600641"]);
    expect(snapshot.stats.limitUpCount).toBe(4);
    expect(snapshot.stats.brokenCount).toBe(40);
    expect(snapshot.stats.maxHeight).toBe(4);
  });

  it("computes broken rate as broken/(limitUp+broken), null when no data", () => {
    expect(computeBrokenRate(93, 40)).toBeCloseTo(40 / 133, 10);
    expect(computeBrokenRate(0, 0)).toBeNull();
  });

  it("returns null broken rate when broken count is unavailable (fetch failure)", () => {
    expect(computeBrokenRate(93, null)).toBeNull();
  });

  it("carries null broken count into the snapshot stats without faking 0", () => {
    const stocks = parseZtPoolResponse(ZT_POOL_FIXTURE).rows.map(mapZtPoolRow);
    const snapshot = buildLadderSnapshot(stocks, null, 20260702);
    expect(snapshot.stats.brokenCount).toBeNull();
    expect(snapshot.stats.brokenRate).toBeNull();
  });

  it("returns an empty snapshot for an empty pool", () => {
    const snapshot = buildLadderSnapshot([], 0, null);
    expect(snapshot.ladder).toEqual([]);
    expect(snapshot.stats).toEqual({ limitUpCount: 0, brokenCount: 0, brokenRate: null, maxHeight: 0 });
  });
});

describe("pool pagination", () => {
  const row = (index: number) => ({ c: String(600000 + index), n: `股票${index}`, lbc: 1, fbt: 92500, fund: 1, zbc: 0, hybk: "测试" });

  it("collects pages until the reported total, deduping by code", async () => {
    const pages: Record<number, number[]> = { 0: [1, 2, 3], 1: [3, 4, 5] };
    const calls: number[] = [];
    const result = await collectPoolPages(async (page) => {
      calls.push(page);
      return { total: 5, qdate: 20260702, rows: (pages[page] ?? []).map(row) };
    });
    expect(result.rows).toHaveLength(5);
    expect(result.qdate).toBe(20260702);
    expect(calls).toEqual([0, 1]);
  });

  it("keeps partial rows when a later page fails, but throws when page 0 fails", async () => {
    const partial = await collectPoolPages(async (page) => {
      if (page === 1) throw new Error("boom");
      return { total: 300, qdate: 20260702, rows: [1, 2, 3].map(row) };
    });
    expect(partial.rows).toHaveLength(3);
    await expect(collectPoolPages(async () => { throw new Error("dead"); })).rejects.toThrow("dead");
  });
});

describe("formatLadderReport", () => {
  it("renders a Chinese Feishu summary with the crowding disclaimer", () => {
    const stocks = parseZtPoolResponse(ZT_POOL_FIXTURE).rows.map(mapZtPoolRow);
    const report = formatLadderReport(buildLadderSnapshot(stocks, 40, 20260702));
    expect(report).toContain("2026-07-02");
    expect(report).toContain("4连板");
    expect(report).toContain("000566 海南海药");
    expect(report).toContain("炸板率");
    expect(report).toContain("不构成买入依据");
  });

  it("renders an explicit empty message for non-trading days", () => {
    const report = formatLadderReport(buildLadderSnapshot([], 0, null));
    expect(report).toContain("涨停池为空");
    expect(report).toContain("不构成买入依据");
  });

  it("renders 炸板 n/a instead of 0 when broken pool data is unavailable", () => {
    const stocks = parseZtPoolResponse(ZT_POOL_FIXTURE).rows.map(mapZtPoolRow);
    const report = formatLadderReport(buildLadderSnapshot(stocks, null, 20260702));
    expect(report).toContain("炸板 n/a");
    expect(report).toContain("炸板率 n/a");
    expect(report).not.toContain("炸板率 0.0%");
  });
});

describe("fetchLimitUpLadder network behavior", () => {
  const ztBody = {
    rc: 0,
    data: {
      tc: 1,
      qdate: 20260702,
      pool: [{ c: "000566", n: "海南海药", zdp: 10.0, lbc: 4, fbt: 93000, lbt: 101600, fund: 120544483, zbc: 1, hybk: "化学制药" }],
    },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes an abort signal to fetch and degrades broken count to null on ZB rc≠0", async () => {
    const captured: { url: string; signal: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { signal?: unknown }) => {
        captured.push({ url, signal: init?.signal });
        const body = url.includes("getTopicZBPool") ? { rc: 1, data: null } : ztBody;
        return new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const snapshot = await fetchLimitUpLadder("20260702");
      expect(captured.length).toBeGreaterThanOrEqual(2);
      for (const call of captured) {
        expect(call.signal).toBeInstanceOf(AbortSignal);
      }
      expect(snapshot.stats.limitUpCount).toBe(1);
      expect(snapshot.stats.brokenCount).toBeNull();
      expect(snapshot.stats.brokenRate).toBeNull();
      expect(formatLadderReport(snapshot)).toContain("炸板率 n/a");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("normalizeLadderDate", () => {
  it("accepts YYYYMMDD and YYYY-MM-DD, rejects garbage", () => {
    expect(normalizeLadderDate("20260702")).toBe("20260702");
    expect(normalizeLadderDate("2026-07-02")).toBe("20260702");
    expect(normalizeLadderDate("abc")).toBeUndefined();
    expect(normalizeLadderDate("")).toBeUndefined();
  });
});
