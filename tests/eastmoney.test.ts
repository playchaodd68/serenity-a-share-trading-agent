import { describe, expect, it } from "vitest";
import { fetchAShareSnapshot, mapEastmoneyStock } from "../src/connectors/eastmoney.js";

describe("Eastmoney mapper", () => {
  it("maps endpoint fields into AShareStock", () => {
    const stock = mapEastmoneyStock({
      f12: "688001",
      f14: "测试公司",
      f2: 12.3,
      f3: 1.2,
      f20: 10,
      f21: 9,
      f9: 33,
      f23: 2,
      f62: 1,
      f100: "半导体",
      f102: "上海",
      f103: "CPO",
    });
    expect(stock.code).toBe("688001");
    expect(stock.industry).toBe("半导体");
    expect(stock.concept).toBe("CPO");
  });

  it("keeps deterministic fixture path available when live snapshot is disabled", async () => {
    const previous = process.env.A_SHARE_DISABLE_FIXTURE;
    process.env.A_SHARE_DISABLE_FIXTURE = "false";
    const stocks = await fetchAShareSnapshot(1);
    if (previous == null) delete process.env.A_SHARE_DISABLE_FIXTURE;
    else process.env.A_SHARE_DISABLE_FIXTURE = previous;
    expect(stocks).toHaveLength(1);
    expect(stocks[0].code).toBeTruthy();
  });
});

describe("snapshot pagination (Eastmoney caps pages at ~100 rows)", () => {
  const makeStock = (index: number) => ({
    code: String(100000 + index).slice(1),
    name: `股票${index}`,
    latestPrice: 10,
    pctChange: 0,
    totalMarketCap: 1_000_000_000,
    floatMarketCap: 500_000_000,
    pe: 20,
    turnover: 1,
    mainNetInflow: 0,
    industry: "测试",
    region: "测试",
    concept: "测试",
  });

  it("collects multiple pages up to the limit and dedupes by code", async () => {
    const { collectSnapshotPages } = await import("../src/connectors/eastmoney.js");
    const pages: Record<number, number[]> = { 1: [1, 2, 3], 2: [3, 4, 5], 3: [6, 7, 8] };
    const calls: number[] = [];
    const stocks = await collectSnapshotPages(async (page) => {
      calls.push(page);
      return { total: 9, stocks: (pages[page] ?? []).map(makeStock) };
    }, 7);
    expect(stocks).toHaveLength(7);
    expect(new Set(stocks.map((stock) => stock.code)).size).toBe(7);
    expect(calls).toEqual([1, 2, 3]);
  });

  it("stops at the reported universe size", async () => {
    const { collectSnapshotPages } = await import("../src/connectors/eastmoney.js");
    const stocks = await collectSnapshotPages(async (page) => ({ total: 4, stocks: page === 1 ? [1, 2, 3, 4].map(makeStock) : [] }), 100);
    expect(stocks).toHaveLength(4);
  });

  it("keeps partial coverage when a later page fails, but throws when page 1 fails", async () => {
    const { collectSnapshotPages } = await import("../src/connectors/eastmoney.js");
    const partial = await collectSnapshotPages(async (page) => {
      if (page === 2) throw new Error("boom");
      return { total: 300, stocks: [1, 2, 3].map(makeStock) };
    }, 300);
    expect(partial).toHaveLength(3);
    await expect(collectSnapshotPages(async () => { throw new Error("dead"); }, 10)).rejects.toThrow("dead");
  });
});

describe("dirty row tolerance (suspended stocks return '-' strings)", () => {
  it("normalizes '-' numeric fields to null instead of failing the page", () => {
    const stock = mapEastmoneyStock({ f12: "600487", f14: "亨通光电", f2: "-" as never, f3: "-" as never, f9: 25.5, f20: "-" as never, f100: "通信设备" });
    expect(stock.latestPrice).toBeNull();
    expect(stock.pctChange).toBeNull();
    expect(stock.pe).toBe(25.5);
    expect(stock.industry).toBe("通信设备");
  });
});
