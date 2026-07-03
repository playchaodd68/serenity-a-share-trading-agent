import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BIAS_TURN_BASE_BARS,
  BIAS_TURN_MIN_BASE_BARS,
  buildLadderSnapshot,
  collectPoolPages,
  computeBiasTurn,
  computeBrokenRate,
  enrichLadderWithBiasTurn,
  fetchLimitUpLadder,
  formatLadderReport,
  type LimitUpStock,
  mapZtPoolRow,
  normalizeLadderDate,
  parseKlineTurnovers,
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

// ===== bias_turn 换手率乖离（P0-6, docs/criteria-redesign-proposal.md §2e）=====
// 观察 overlay：仅供梯队页展示，绝不参与任何评分/排序。

describe("computeBiasTurn", () => {
  it("computes 近5日均 / 近480日均 − 1 from a known turnover series", () => {
    // 475 根 1.0 + 最近 5 根 5.0：near = 5.0，base = (475×1 + 5×5)/480 = 500/480
    // bias = 5 / (500/480) − 1 = 4.8 − 1 = 3.8
    const series = [...Array(475).fill(1), ...Array(5).fill(5)];
    expect(computeBiasTurn(series)).toBeCloseTo(3.8, 10);
  });

  it("uses only the trailing 480 bars as the base window", () => {
    // 480 根之前的天量换手必须被基期窗口丢弃，否则老股乖离被系统性压低
    const series = [...Array(100).fill(100), ...Array(475).fill(1), ...Array(5).fill(5)];
    expect(computeBiasTurn(series)).toBeCloseTo(3.8, 10);
  });

  it("returns 0 when recent turnover equals the long-run average", () => {
    expect(computeBiasTurn(Array(BIAS_TURN_BASE_BARS).fill(2))).toBeCloseTo(0, 10);
    expect(computeBiasTurn(Array(BIAS_TURN_MIN_BASE_BARS).fill(2))).toBeCloseTo(0, 10);
  });

  it("returns null when history is shorter than the minimum base window (次新股)", () => {
    expect(computeBiasTurn(Array(BIAS_TURN_MIN_BASE_BARS - 1).fill(2))).toBeNull();
    expect(computeBiasTurn([])).toBeNull();
  });

  it("returns null when the base mean is zero instead of dividing by zero", () => {
    expect(computeBiasTurn(Array(480).fill(0))).toBeNull();
  });

  it("drops non-finite entries instead of poisoning the means", () => {
    const series = [...Array(475).fill(1), Number.NaN, ...Array(5).fill(5)];
    expect(computeBiasTurn(series)).toBeCloseTo(3.8, 10);
  });
});

describe("parseKlineTurnovers", () => {
  it("parses date,turnover lines and drops dirty rows", () => {
    const payload = { rc: 0, data: { klines: ["2026-07-01,1.25", "2026-07-02,-", "2026-07-03,27.67"] } };
    expect(parseKlineTurnovers(payload)).toEqual([1.25, 27.67]);
  });

  it("returns [] for a null data envelope (unknown secid)", () => {
    expect(parseKlineTurnovers({ rc: 0, data: null })).toEqual([]);
  });
});

describe("enrichLadderWithBiasTurn", () => {
  const stock = (code: string, height: number): LimitUpStock => ({
    code,
    name: `股票${code}`,
    industry: "测试",
    pctChange: 10,
    height,
    sealAmount: 1_000_000,
    brokenCount: 0,
    firstSealTime: "09:30",
  });

  const klinePayload = (turnovers: number[]) => ({
    rc: 0,
    data: { klines: turnovers.map((value, index) => `2024-01-${String((index % 28) + 1).padStart(2, "0")},${value}`) },
  });

  it("enriches only stocks with height ≥ 2, records null on per-stock failure, and never mutates the input", async () => {
    const original = buildLadderSnapshot(
      [stock("000001", 1), stock("600002", 2), stock("000003", 3), stock("300004", 3)],
      0,
      20260702,
    );
    const urls: string[] = [];
    const fetchJson = vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("0.000003")) return klinePayload(Array(30).fill(2)); // 历史不足 → null
      if (url.includes("0.300004")) throw new Error("kline unavailable"); // 单股失败 → null，不断链
      return klinePayload([...Array(475).fill(1), ...Array(5).fill(5)]); // 600002 → 3.8
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const enriched = await enrichLadderWithBiasTurn(original, { fetchJson });
      const byCode = new Map(enriched.ladder.flatMap((tier) => tier.stocks).map((entry) => [entry.code, entry]));

      // 首板不参与计算：字段缺省（undefined），也没有为它发起请求
      expect("biasTurn" in byCode.get("000001")!).toBe(false);
      expect(urls.some((url) => url.includes("000001"))).toBe(false);
      expect(byCode.get("600002")!.biasTurn).toBeCloseTo(3.8, 10);
      expect(byCode.get("000003")!.biasTurn).toBeNull();
      expect(byCode.get("300004")!.biasTurn).toBeNull();
      expect(fetchJson).toHaveBeenCalledTimes(3);
      expect(warnSpy).toHaveBeenCalled();

      // 请求参数契约：日K、前复权、f61 换手率、480 根、end 锚定快照日期、沪深 secid 前缀
      const kline600002 = urls.find((url) => url.includes("1.600002"))!;
      expect(kline600002).toContain("klt=101");
      expect(kline600002).toContain("fqt=1");
      expect(kline600002).toContain("f61");
      expect(kline600002).toContain(`lmt=${BIAS_TURN_BASE_BARS}`);
      expect(kline600002).toContain("end=20260702");
      expect(urls.some((url) => url.includes("0.000003"))).toBe(true);

      // 不可变性：原快照的股票对象绝不能被挂上 biasTurn
      expect(enriched).not.toBe(original);
      expect(original.ladder.flatMap((tier) => tier.stocks).every((entry) => !("biasTurn" in entry))).toBe(true);
      // 非 bias 字段原样保留
      expect(byCode.get("600002")!.sealAmount).toBe(1_000_000);
      expect(enriched.stats).toEqual(original.stats);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("falls back to a far-future end when the snapshot date is unknown", async () => {
    const original = buildLadderSnapshot([stock("600002", 2)], 0, null);
    const urls: string[] = [];
    const fetchJson = async (url: string) => {
      urls.push(url);
      return klinePayload(Array(480).fill(1));
    };
    await enrichLadderWithBiasTurn(original, { fetchJson });
    expect(urls[0]).toContain("end=20500101");
  });

  it("skips fetching entirely when no stock reaches the height threshold", async () => {
    const original = buildLadderSnapshot([stock("000001", 1), stock("000005", 1)], 0, 20260702);
    const fetchJson = vi.fn(async () => klinePayload(Array(480).fill(1)));
    const enriched = await enrichLadderWithBiasTurn(original, { fetchJson });
    expect(fetchJson).not.toHaveBeenCalled();
    expect(enriched).toEqual(original);
  });

  it("caps in-flight kline requests at the concurrency limit (≤4)", async () => {
    const stocks = Array.from({ length: 9 }, (_, index) => stock(String(600100 + index), 2 + (index % 2)));
    const original = buildLadderSnapshot(stocks, 0, 20260702);
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchJson = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return klinePayload([...Array(475).fill(1), ...Array(5).fill(5)]);
    };
    const enriched = await enrichLadderWithBiasTurn(original, { fetchJson });
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThanOrEqual(2);
    const values = enriched.ladder.flatMap((tier) => tier.stocks).map((entry) => entry.biasTurn);
    expect(values).toHaveLength(9);
    for (const value of values) expect(value).toBeCloseTo(3.8, 10);
  });
});
