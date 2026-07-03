import { z } from "zod";
import type { PriceReturnProvider } from "./resolution.js";
import { createFfdPriceReturnProvider, windowReturn } from "./resolution-provider.js";
import type { ParsedBar } from "./resolution-provider.js";

// Fallback price source for the resolution loop: Eastmoney push2his daily klines
// (前复权 fqt=1, same endpoint family as scripts/fetch-quant-history.mjs). FFD stays the
// primary provider; this exists because the FFD quote-history backend was observed down
// on 2026-07-02 and an unresolvable graveyard would leave buriedHitRate stuck at null.
// Deterministic data only — closes in, window returns out; no scoring of any kind.

export const EASTMONEY_BENCHMARK_SECID = "1.000300"; // 沪深300
const KLINE_TIMEOUT_MS = 15_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Same padding as the FFD provider: fetch a few extra days past the horizon so the
// exit bar exists even when the window ends on a non-trading day.
const WINDOW_PADDING_DAYS = 10;

const KlineResponse = z.object({
  data: z
    .object({
      klines: z.array(z.string()),
    })
    .nullable(),
});

/** 6开头=沪市(1.), 其余=深市(0.) — mirrors connectors/eastmoney.ts secidForCode. */
function secidForCode(code: string): string {
  return `${code.startsWith("6") ? "1" : "0"}.${code}`;
}

function klineUrl(secid: string, beg: string, end: string): string {
  const params = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: "101",
    fqt: "1",
    beg,
    end,
  });
  return `https://push2his.eastmoney.com/api/qt/stock/kline/get?${params.toString()}`;
}

// kline row: date,open,close,high,low,volume,amount,amplitude,pct_change,...
export function parseEastmoneyKlines(payload: unknown): ParsedBar[] {
  const parsed = KlineResponse.parse(payload);
  if (!parsed.data) return [];
  return parsed.data.klines
    .map((line) => {
      const [date, , close] = line.split(",");
      const closeNumber = Number(close);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !Number.isFinite(closeNumber)) return null;
      return { date, close: closeNumber };
    })
    .filter((bar): bar is ParsedBar => bar != null);
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 serenity-a-share-trading-agent/1.0", referer: "https://quote.eastmoney.com/" },
    signal: AbortSignal.timeout(KLINE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Eastmoney kline request failed: ${response.status}`);
  return response.json();
}

export interface EastmoneyPriceProviderOptions {
  benchmarkSecid?: string;
  /** Injectable transport for deterministic tests. */
  fetchJson?: (url: string) => Promise<unknown>;
}

export function createEastmoneyPriceReturnProvider(options: EastmoneyPriceProviderOptions = {}): PriceReturnProvider {
  const benchmarkSecid = options.benchmarkSecid ?? EASTMONEY_BENCHMARK_SECID;
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  return async ({ code, entryDate, horizonDays }) => {
    const beg = entryDate.slice(0, 10).replaceAll("-", "");
    const end = new Date(Date.parse(entryDate) + (horizonDays + WINDOW_PADDING_DAYS) * MS_PER_DAY)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");
    try {
      const [stockBars, benchmarkBars] = await Promise.all([
        fetchJson(klineUrl(secidForCode(code), beg, end)).then(parseEastmoneyKlines),
        fetchJson(klineUrl(benchmarkSecid, beg, end)).then(parseEastmoneyKlines),
      ]);
      const stockReturn = windowReturn(stockBars, entryDate, horizonDays);
      const benchmarkReturn = windowReturn(benchmarkBars, entryDate, horizonDays);
      if (stockReturn == null || benchmarkReturn == null) {
        console.warn(`eastmoney price provider: 无法为 ${code} 计算 ${horizonDays} 天窗口收益（数据缺失或窗口未走完），跳过。`);
        return null;
      }
      return { stockReturn, benchmarkReturn };
    } catch (error) {
      console.warn(
        `eastmoney price provider: 取数失败（${code}）：${error instanceof Error ? error.message : String(error)}；跳过。`,
      );
      return null;
    }
  };
}

// Degradation chain: providers are tried in order and the first real observation wins.
// A provider signals failure by returning null (both FFD and Eastmoney providers catch
// their own errors), so an unresolved thesis stays unresolved — never fabricated.
export function createFallbackPriceReturnProvider(providers: PriceReturnProvider[]): PriceReturnProvider {
  return async (input) => {
    for (const provider of providers) {
      const observation = await provider(input);
      if (observation != null) return observation;
    }
    return null;
  };
}

/** Production default: FFD 优先，宕机/缺数时降级东财 push2his。 */
export function createResilientPriceReturnProvider(): PriceReturnProvider {
  return createFallbackPriceReturnProvider([createFfdPriceReturnProvider(), createEastmoneyPriceReturnProvider()]);
}
