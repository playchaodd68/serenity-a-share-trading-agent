import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectDatacenterPages,
  expressPageUrl,
  fetchEarningsExpress,
  fetchEarningsPreannouncements,
  mapExpressRow,
  mapPreannouncementRow,
  parseDatacenterEnvelope,
  preannouncementPageUrl,
} from "../src/connectors/eastmoney-earnings.js";

// Trimmed live fixtures captured via curl on 2026-07-03 from
// https://datacenter-web.eastmoney.com/api/data/v1/get (real field values; long
// PREDICT_CONTENT/CHANGE_REASON_EXPLAIN texts shortened, row count reduced).
const PREANNOUNCEMENT_FIXTURE = {
  version: "fd74bac87aaee41142dec2564337d387",
  result: {
    pages: 1,
    count: 2,
    data: [
      {
        SECUCODE: "603618.SH",
        SECURITY_CODE: "603618",
        SECURITY_NAME_ABBR: "杭电股份",
        ORG_CODE: "10127716",
        NOTICE_DATE: "2026-07-04 00:00:00",
        REPORT_DATE: "2026-06-30 00:00:00",
        PREDICT_FINANCE_CODE: "004",
        PREDICT_FINANCE: "归属于上市公司股东的净利润",
        PREDICT_AMT_LOWER: 360000000,
        PREDICT_AMT_UPPER: 400000000,
        ADD_AMP_LOWER: 852.03,
        ADD_AMP_UPPER: 957.82,
        PREDICT_CONTENT: "预计2026年1-6月归属于上市公司股东的净利润盈利:36,000万元至40,000万元,同比上年增长:852.03%至957.82%。",
        PREDICT_TYPE: "预增",
        PREYEAR_SAME_PERIOD: 37813800,
        TRADE_MARKET: "上交所主板",
        FORECAST_JZ: 380000000,
        FORECAST_STATE: "increase",
        IS_LATEST: "T",
      },
      // 仅披露增速区间、未披露净利润金额的预告（提案 §2b-2：不倒算净利润）。
      {
        SECUCODE: "300000.SZ",
        SECURITY_CODE: "300000",
        SECURITY_NAME_ABBR: "样本科技",
        NOTICE_DATE: "2026-07-02 00:00:00",
        REPORT_DATE: "2026-06-30 00:00:00",
        PREDICT_FINANCE_CODE: "004",
        PREDICT_FINANCE: "归属于上市公司股东的净利润",
        PREDICT_AMT_LOWER: null,
        PREDICT_AMT_UPPER: null,
        ADD_AMP_LOWER: 50,
        ADD_AMP_UPPER: 80,
        PREDICT_CONTENT: "预计2026年1-6月归属于上市公司股东的净利润同比增长50%至80%。",
        PREDICT_TYPE: "预增",
        PREYEAR_SAME_PERIOD: 100000000,
        IS_LATEST: "T",
      },
    ],
  },
  success: true,
  message: "ok",
  code: 0,
};

// Trimmed live fixture captured via curl on 2026-07-03 (RPT_FCI_PERFORMANCEE)。
// 真实边界：亏损收窄（净利为负、JLRTBZCL 为正）的快报行。
const EXPRESS_FIXTURE = {
  version: "21b5353668e3adc386423828b1e1faab",
  result: {
    pages: 1,
    count: 1,
    data: [
      {
        SECURITY_CODE: "688806",
        SECURITY_NAME_ABBR: "泰诺麦博",
        TRADE_MARKET: "上交所科创板",
        UPDATE_DATE: "2026-05-22 00:00:00",
        REPORT_DATE: "2026-03-31 00:00:00",
        BASIC_EPS: null,
        TOTAL_OPERATE_INCOME: 24928900,
        TOTAL_OPERATE_INCOME_SQ: 169315.48,
        PARENT_NETPROFIT: -96385000,
        PARENT_NETPROFIT_SQ: -176719526.52,
        YSTZ: 14623.3436659188,
        JLRTBZCL: 45.458771931979,
        PUBLISHNAME: "生物制品",
        NOTICE_DATE: "2026-05-22 00:00:00",
        QDATE: "2026Q1",
        DATATYPE: "2026年 一季报",
        ISNEW: "1",
        SECUCODE: "688806.SH",
      },
    ],
  },
  success: true,
  message: "ok",
  code: 0,
};

// Verified live 2026-07-03: empty result sets come back as success:false + code 9201.
const EMPTY_FIXTURE = { version: null, result: null, success: false, message: "返回数据为空", code: 9201 };

describe("datacenter envelope parsing", () => {
  it("parses a live fixture into pages/count/rows", () => {
    const parsed = parseDatacenterEnvelope(PREANNOUNCEMENT_FIXTURE);
    expect(parsed.pages).toBe(1);
    expect(parsed.count).toBe(2);
    expect(parsed.rows).toHaveLength(2);
  });

  it("treats code 9201 (返回数据为空) as an empty result, not an error", () => {
    expect(parseDatacenterEnvelope(EMPTY_FIXTURE)).toEqual({ pages: 0, count: 0, rows: [] });
  });

  it("throws on other API-level failures instead of masquerading as empty", () => {
    expect(() => parseDatacenterEnvelope({ version: null, result: null, success: false, message: "系统繁忙", code: 500 })).toThrow(/500/);
  });
});

describe("preannouncement row mapping", () => {
  it("maps real fields into a typed EarningsPreannouncement", () => {
    const rows = parseDatacenterEnvelope(PREANNOUNCEMENT_FIXTURE).rows;
    const item = mapPreannouncementRow(rows[0]);
    expect(item).not.toBeNull();
    expect(item?.code).toBe("603618");
    expect(item?.name).toBe("杭电股份");
    expect(item?.periodEnd).toBe("2026-06-30");
    expect(item?.announceDate).toBe("2026-07-04");
    expect(item?.type).toBe("预增");
    expect(item?.forecastNetProfitLow).toBe(360000000);
    expect(item?.forecastNetProfitHigh).toBe(400000000);
    expect(item?.changePctLow).toBeCloseTo(852.03, 6);
    expect(item?.changePctHigh).toBeCloseTo(957.82, 6);
    expect(item?.prevYearSamePeriodNetProfit).toBe(37813800);
    expect(item?.content).toContain("36,000万元");
  });

  it("keeps 增速区间-only rows with null profit bounds (不倒算净利润)", () => {
    const rows = parseDatacenterEnvelope(PREANNOUNCEMENT_FIXTURE).rows;
    const item = mapPreannouncementRow(rows[1]);
    expect(item?.forecastNetProfitLow).toBeNull();
    expect(item?.forecastNetProfitHigh).toBeNull();
    expect(item?.changePctLow).toBe(50);
    expect(item?.changePctHigh).toBe(80);
  });

  it("tolerates dirty scalar fields and returns null for unusable rows", () => {
    const dirty = mapPreannouncementRow({
      SECURITY_CODE: "000001",
      SECURITY_NAME_ABBR: "某股",
      NOTICE_DATE: "2026-07-01 00:00:00",
      REPORT_DATE: "2026-06-30 00:00:00",
      PREDICT_TYPE: "预盈",
      PREDICT_AMT_LOWER: "-",
      PREDICT_AMT_UPPER: null,
      ADD_AMP_LOWER: "12.5",
    });
    expect(dirty?.forecastNetProfitLow).toBeNull();
    expect(dirty?.changePctLow).toBeCloseTo(12.5, 6);
    expect(mapPreannouncementRow({ garbage: true })).toBeNull();
    expect(mapPreannouncementRow(null)).toBeNull();
  });
});

describe("express row mapping", () => {
  it("maps real fields, keeping negative net profit with positive yoy (亏损收窄)", () => {
    const rows = parseDatacenterEnvelope(EXPRESS_FIXTURE).rows;
    const item = mapExpressRow(rows[0]);
    expect(item).not.toBeNull();
    expect(item?.code).toBe("688806");
    expect(item?.name).toBe("泰诺麦博");
    expect(item?.periodEnd).toBe("2026-03-31");
    expect(item?.announceDate).toBe("2026-05-22");
    expect(item?.netProfit).toBe(-96385000);
    expect(item?.netProfitYoyPct).toBeCloseTo(45.458771931979, 9);
    expect(item?.prevYearSamePeriodNetProfit).toBeCloseTo(-176719526.52, 6);
    expect(item?.revenue).toBe(24928900);
    expect(item?.eps).toBeNull();
  });

  it("returns null for rows without a usable code", () => {
    expect(mapExpressRow({ SECURITY_NAME_ABBR: "缺代码" })).toBeNull();
  });
});

describe("datacenter pagination", () => {
  const row = (index: number) => ({ key: String(index) });

  it("collects pages until the reported count, deduping by key", async () => {
    const pages: Record<number, number[]> = { 1: [1, 2, 3], 2: [3, 4, 5] };
    const calls: number[] = [];
    const rows = await collectDatacenterPages(
      async (page) => {
        calls.push(page);
        return { pages: 2, count: 5, rows: (pages[page] ?? []).map(row) };
      },
      (item) => item.key,
    );
    expect(rows).toHaveLength(5);
    expect(calls).toEqual([1, 2]);
  });

  it("keeps partial rows when a later page fails, but throws when page 1 fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const partial = await collectDatacenterPages(
        async (page) => {
          if (page === 2) throw new Error("boom");
          return { pages: 9, count: 900, rows: [1, 2, 3].map(row) };
        },
        (item) => item.key,
      );
      expect(partial).toHaveLength(3);
      expect(warnSpy).toHaveBeenCalled();
      await expect(
        collectDatacenterPages(
          async () => {
            throw new Error("dead");
          },
          (item: { key: string }) => item.key,
        ),
      ).rejects.toThrow("dead");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("query url building", () => {
  it("builds the preannouncement filter with 归母净利润 口径、日期与代码清单", () => {
    const url = preannouncementPageUrl({ dateFrom: "2026-06-01", codes: ["603618", "300750"] }, 1);
    expect(url).toContain("datacenter-web.eastmoney.com/api/data/v1/get");
    expect(url).toContain("RPT_PUBLIC_OP_NEWPREDICT");
    const filter = new URL(url).searchParams.get("filter") ?? "";
    expect(filter).toContain('(PREDICT_FINANCE_CODE="004")');
    expect(filter).toContain("(NOTICE_DATE>='2026-06-01')");
    expect(filter).toContain('(SECURITY_CODE in ("603618","300750"))');
  });

  it("builds the express url without a codes clause when codes are omitted", () => {
    const url = expressPageUrl({ dateFrom: "2026-04-01" }, 2);
    expect(url).toContain("RPT_FCI_PERFORMANCEE");
    expect(url).toContain("pageNumber=2");
    const filter = new URL(url).searchParams.get("filter") ?? "";
    expect(filter).toContain("(NOTICE_DATE>='2026-04-01')");
    expect(filter).not.toContain("SECURITY_CODE");
  });

  it("rejects malformed dates and non 6-digit codes (filter 注入防线)", () => {
    expect(() => preannouncementPageUrl({ dateFrom: "20260601" }, 1)).toThrow(/dateFrom/);
    expect(() => preannouncementPageUrl({ dateFrom: "2026-06-01", codes: ['603618") or ("1"="1'] }, 1)).toThrow(/codes/);
  });
});

describe("fetch functions network behavior", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchEarningsPreannouncements passes an abort signal and maps rows", async () => {
    const captured: { url: string; signal: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { signal?: unknown }) => {
        captured.push({ url, signal: init?.signal });
        return new Response(JSON.stringify(PREANNOUNCEMENT_FIXTURE), { status: 200 });
      }),
    );
    const items = await fetchEarningsPreannouncements({ dateFrom: "2026-06-25" });
    expect(items).toHaveLength(2);
    // 输出确定性排序：公告日倒序。
    expect(items.map((item) => item.code)).toEqual(["603618", "300000"]);
    expect(captured.length).toBeGreaterThanOrEqual(1);
    for (const call of captured) {
      expect(call.signal).toBeInstanceOf(AbortSignal);
      expect(call.url).toContain("RPT_PUBLIC_OP_NEWPREDICT");
    }
  });

  it("fetchEarningsExpress returns [] on the empty-result code instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(EMPTY_FIXTURE), { status: 200 })),
    );
    await expect(fetchEarningsExpress({ dateFrom: "2026-06-01" })).resolves.toEqual([]);
  });
});
