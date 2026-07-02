import { describe, expect, it } from "vitest";
import {
  BEIJING_BOARD_LIMIT_RATIO,
  GROWTH_BOARD_LIMIT_RATIO,
  MAIN_BOARD_LIMIT_RATIO,
  ST_LIMIT_RATIO,
  canBuyBar,
  canSellBar,
  hasCompleteOhlc,
  isAtLimitPrice,
  isOnePriceBar,
  isSuspendedBar,
  limitPriceFor,
  limitRatioFor,
} from "../src/quant/execution-constraints.js";

describe("涨跌停幅度按板块区分", () => {
  it("主板股票涨跌停幅度为10%", () => {
    expect(limitRatioFor("600519")).toBe(MAIN_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("000001")).toBe(MAIN_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("601318")).toBe(MAIN_BOARD_LIMIT_RATIO);
  });

  it("创业板与科创板涨跌停幅度为20%", () => {
    expect(limitRatioFor("300750")).toBe(GROWTH_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("301111")).toBe(GROWTH_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("688001")).toBe(GROWTH_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("689009")).toBe(GROWTH_BOARD_LIMIT_RATIO);
  });

  it("北交所涨跌停幅度为30%", () => {
    expect(limitRatioFor("832000")).toBe(BEIJING_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("430047")).toBe(BEIJING_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("873169")).toBe(BEIJING_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("920001")).toBe(BEIJING_BOARD_LIMIT_RATIO);
    expect(limitRatioFor("830799.BJ")).toBe(BEIJING_BOARD_LIMIT_RATIO);
  });

  it("ST股涨跌停幅度为5%且覆盖板块默认值", () => {
    expect(limitRatioFor("600519", true)).toBe(ST_LIMIT_RATIO);
    expect(limitRatioFor("300750", true)).toBe(ST_LIMIT_RATIO);
  });
});

describe("涨跌停价按整数分四舍五入", () => {
  it("ST股18.90元跌停价为17.96而非浮点误差下的17.95", () => {
    // 18.90 × 0.95 = 17.955，浮点存储为 17.954999...，直接 round 会得到 17.95（错）
    expect(limitPriceFor(18.9, ST_LIMIT_RATIO, "down")).toBe(17.96);
  });

  it("ST股18.90元涨停价为19.85（交易所四舍五入而非银行家舍入）", () => {
    // 18.90 × 1.05 = 19.845，交易所 round half up → 19.85
    expect(limitPriceFor(18.9, ST_LIMIT_RATIO, "up")).toBe(19.85);
  });

  it("主板整数价格涨跌停价无误差", () => {
    expect(limitPriceFor(10, MAIN_BOARD_LIMIT_RATIO, "up")).toBe(11);
    expect(limitPriceFor(10, MAIN_BOARD_LIMIT_RATIO, "down")).toBe(9);
  });

  it("创业板9.87元按20%幅度四舍五入到分", () => {
    // 9.87 × 1.2 = 11.844 → 11.84；9.87 × 0.8 = 7.896 → 7.90
    expect(limitPriceFor(9.87, GROWTH_BOARD_LIMIT_RATIO, "up")).toBe(11.84);
    expect(limitPriceFor(9.87, GROWTH_BOARD_LIMIT_RATIO, "down")).toBe(7.9);
  });

  it("无效昨收价或幅度直接抛错", () => {
    expect(() => limitPriceFor(0, MAIN_BOARD_LIMIT_RATIO, "up")).toThrow();
    expect(() => limitPriceFor(Number.NaN, MAIN_BOARD_LIMIT_RATIO, "up")).toThrow();
    expect(() => limitPriceFor(10, 0, "up")).toThrow();
    expect(() => limitPriceFor(10, 1.5, "down")).toThrow();
  });

  it("触及涨跌停价以半分容差比较", () => {
    expect(isAtLimitPrice(11, 11.000000001)).toBe(true);
    expect(isAtLimitPrice(10.99, 11)).toBe(false);
  });
});

describe("一字板判定", () => {
  it("OHLC全同价视为一字板", () => {
    expect(isOnePriceBar({ open: 12, high: 12, low: 12, close: 12 })).toBe(true);
  });

  it("高价股OHLC极差在收盘价万分之一容差内视为一字板", () => {
    expect(isOnePriceBar({ open: 200.01, high: 200.02, low: 200, close: 200.02 })).toBe(true);
  });

  it("盘中开板（极差超容差）不算一字板", () => {
    expect(isOnePriceBar({ open: 10, high: 10.5, low: 9.9, close: 10.3 })).toBe(false);
  });

  it("缺少完整OHLC时不判定为一字板", () => {
    expect(isOnePriceBar({ open: 10, close: 10 })).toBe(false);
    expect(hasCompleteOhlc({ open: 10, close: 10 })).toBe(false);
    expect(hasCompleteOhlc({ open: 10, high: 10, low: 10, close: 10 })).toBe(true);
  });
});

describe("停牌判定", () => {
  it("无任何有效价格视为停牌", () => {
    expect(isSuspendedBar({})).toBe(true);
    expect(isSuspendedBar({ open: Number.NaN, high: Number.NaN, low: Number.NaN, close: Number.NaN })).toBe(true);
  });

  it("零成交量且价格无波动视为停牌", () => {
    expect(isSuspendedBar({ open: 10, high: 10, low: 10, close: 10, volume: 0 })).toBe(true);
  });

  it("零成交量但价格有波动不算停牌（脏数据容忍）", () => {
    expect(isSuspendedBar({ open: 10, high: 10.5, low: 9.8, close: 10.2, volume: 0 })).toBe(false);
  });

  it("有成交量的平价K线不算停牌", () => {
    expect(isSuspendedBar({ open: 10, high: 10, low: 10, close: 10, volume: 1000 })).toBe(false);
  });
});

describe("买卖可执行判定", () => {
  it("一字涨停当日禁止买入", () => {
    const check = canBuyBar({ open: 12, high: 12, low: 12, close: 12, volume: 1000 }, { limitUp: true });
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("buy_limit_up");
  });

  it("涨停但盘中开板（非一字）可以买入", () => {
    const check = canBuyBar({ open: 10.8, high: 12, low: 10.5, close: 12, volume: 50_000 }, { limitUp: true });
    expect(check.ok).toBe(true);
  });

  it("停牌当日禁止买入", () => {
    const check = canBuyBar({ open: 10, high: 10, low: 10, close: 10, volume: 0 }, { limitUp: false });
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("buy_suspended");
  });

  it("入场价无效禁止买入", () => {
    const check = canBuyBar({ open: 10, high: 10.5, low: 9.8, close: 10.2, volume: 1000 }, { limitUp: false, entryPrice: 0 });
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("buy_invalid_price");
  });

  it("一字跌停当日禁止卖出", () => {
    const check = canSellBar({ open: 8, high: 8, low: 8, close: 8, volume: 500 }, { limitDown: true });
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("sell_limit_down");
  });

  it("跌停但盘中开板（非一字）可以卖出", () => {
    const check = canSellBar({ open: 8.6, high: 8.9, low: 8, close: 8, volume: 20_000 }, { limitDown: true });
    expect(check.ok).toBe(true);
  });

  it("停牌当日禁止卖出", () => {
    const check = canSellBar({ open: 10, high: 10, low: 10, close: 10, volume: 0 }, { limitDown: false });
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("sell_suspended");
  });

  it("出场价无效禁止卖出", () => {
    const check = canSellBar({ open: 10, high: 10.5, low: 9.8, close: 10.2, volume: 1000 }, { limitDown: false, exitPrice: Number.NaN });
    expect(check.ok).toBe(false);
    expect(check.reason).toBe("sell_invalid_price");
  });
});
