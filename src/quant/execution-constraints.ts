// A股撮合执行约束的确定性纯函数：涨跌停价整数分算术、板块幅度、一字板与停牌判定。
// 只做数据计算与规则约束，不含任何综合评分/打分排序（量化综合评分层已于 2026-07-02 移除）。

export const MAIN_BOARD_LIMIT_RATIO = 0.1;
export const GROWTH_BOARD_LIMIT_RATIO = 0.2; // 创业板 300/301、科创板 688/689
export const BEIJING_BOARD_LIMIT_RATIO = 0.3; // 北交所
export const ST_LIMIT_RATIO = 0.05; // ST/*ST，覆盖板块默认值

const GROWTH_BOARD_PREFIXES = ["300", "301", "688", "689"] as const;
const BEIJING_BOARD_PREFIXES = ["43", "83", "87", "92"] as const;

const CENTS_PER_YUAN = 100;
// 一字板容差：OHLC 极差 ≤ max(收盘价 × 1e-4, 0.01)
const ONE_PRICE_RANGE_RATIO = 1e-4;
const MIN_PRICE_TICK = 0.01;
// 涨跌停触及比较容差：半分（同参考实现 |close - limit| < 0.005）
const LIMIT_TOUCH_TOLERANCE = 0.005;

export interface ExecutionBar {
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

export type ExecutionBlockReason =
  | "buy_suspended"
  | "buy_invalid_price"
  | "buy_limit_up"
  | "sell_suspended"
  | "sell_invalid_price"
  | "sell_limit_down";

export interface ExecutionCheck {
  ok: boolean;
  reason?: ExecutionBlockReason;
}

export function isValidPrice(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** 按证券代码推断涨跌停幅度；isSt 为真时按 5% 覆盖板块默认值。 */
export function limitRatioFor(code: string, isSt = false): number {
  if (isSt) return ST_LIMIT_RATIO;
  const normalized = code.trim().toUpperCase();
  if (normalized.endsWith(".BJ")) return BEIJING_BOARD_LIMIT_RATIO;
  const digits = normalized.match(/\d{6}/)?.[0] ?? normalized;
  if (GROWTH_BOARD_PREFIXES.some((prefix) => digits.startsWith(prefix))) return GROWTH_BOARD_LIMIT_RATIO;
  if (BEIJING_BOARD_PREFIXES.some((prefix) => digits.startsWith(prefix))) return BEIJING_BOARD_LIMIT_RATIO;
  return MAIN_BOARD_LIMIT_RATIO;
}

/**
 * 用「分」为单位的整数算术计算涨跌停价，规避浮点精度问题。
 *
 * 交易所涨跌停价 = round(prevClose × (1 ± ratio), 2)，标准四舍五入（round half up）。
 * 直接浮点相乘会丢精度：18.90 × 0.95 = 17.955 浮点存储为 17.954999...，
 * 四舍五入后得 17.95（错，应为 17.96）。
 * 先把昨收转成整数「分」，再乘整数系数（105/95、110/90、120/80、130/70）后加 50 取整回分。
 */
export function limitPriceFor(prevClose: number, ratio: number, direction: "up" | "down"): number {
  if (!isValidPrice(prevClose)) throw new Error(`Invalid prevClose for limit price: ${prevClose}`);
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) throw new Error(`Invalid limit ratio: ${ratio}`);
  const sign = direction === "up" ? 1 : -1;
  const numerator = Math.round((1 + sign * ratio) * CENTS_PER_YUAN);
  const prevCents = Math.floor(prevClose * CENTS_PER_YUAN + 0.5);
  const limitCents = Math.floor((prevCents * numerator + CENTS_PER_YUAN / 2) / CENTS_PER_YUAN);
  return limitCents / CENTS_PER_YUAN;
}

/** 价格是否触及涨跌停价（半分容差）。 */
export function isAtLimitPrice(price: number | undefined, limitPrice: number | undefined): boolean {
  if (!isValidPrice(price) || !isValidPrice(limitPrice)) return false;
  return Math.abs(price - limitPrice) < LIMIT_TOUCH_TOLERANCE;
}

export function hasCompleteOhlc(bar: ExecutionBar): boolean {
  return isValidPrice(bar.open) && isValidPrice(bar.high) && isValidPrice(bar.low) && isValidPrice(bar.close);
}

function onePriceEpsilon(referencePrice: number): number {
  return Math.max(Math.abs(referencePrice) * ONE_PRICE_RANGE_RATIO, MIN_PRICE_TICK);
}

/** 一字板判定：OHLC 完整且极差 ≤ max(收盘价 × 1e-4, 0.01)。信息不足时不判定为一字。 */
export function isOnePriceBar(bar: ExecutionBar): boolean {
  if (!hasCompleteOhlc(bar)) return false;
  const prices = [bar.open!, bar.high!, bar.low!, bar.close!];
  return Math.max(...prices) - Math.min(...prices) <= onePriceEpsilon(bar.close!);
}

/** 停牌判定：无任何有效价格，或成交量 ≤ 0 且价格无波动（脏数据容忍：有波动不算停牌）。 */
export function isSuspendedBar(bar: ExecutionBar): boolean {
  const validPrices = [bar.open, bar.high, bar.low, bar.close].filter(isValidPrice);
  if (validPrices.length === 0) return true;
  if (bar.volume != null && bar.volume <= 0) {
    const reference = isValidPrice(bar.close) ? bar.close : validPrices[validPrices.length - 1];
    return Math.max(...validPrices) - Math.min(...validPrices) <= onePriceEpsilon(reference);
  }
  return false;
}

/** 买入可执行判定：停牌禁买、入场价无效禁买、一字涨停禁买（触板开板可成交）。 */
export function canBuyBar(bar: ExecutionBar, context: { limitUp?: boolean; entryPrice?: number } = {}): ExecutionCheck {
  if (isSuspendedBar(bar)) return { ok: false, reason: "buy_suspended" };
  const entryPrice = context.entryPrice ?? bar.open ?? bar.close;
  if (!isValidPrice(entryPrice)) return { ok: false, reason: "buy_invalid_price" };
  if (context.limitUp && isOnePriceBar(bar)) return { ok: false, reason: "buy_limit_up" };
  return { ok: true };
}

/** 卖出可执行判定：停牌禁卖、出场价无效禁卖、一字跌停禁卖（触板开板可成交）。 */
export function canSellBar(bar: ExecutionBar, context: { limitDown?: boolean; exitPrice?: number } = {}): ExecutionCheck {
  if (isSuspendedBar(bar)) return { ok: false, reason: "sell_suspended" };
  const exitPrice = context.exitPrice ?? bar.close;
  if (!isValidPrice(exitPrice)) return { ok: false, reason: "sell_invalid_price" };
  if (context.limitDown && isOnePriceBar(bar)) return { ok: false, reason: "sell_limit_down" };
  return { ok: true };
}
