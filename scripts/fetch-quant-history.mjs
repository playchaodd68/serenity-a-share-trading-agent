// Fetch daily bars from Eastmoney for quant backtest input.
// Usage: node scripts/fetch-quant-history.mjs [SH:688072,SZ:002384,...] [beg=20260518] [end=20260703]
// Writes data/quant/history.csv (stocks) and data/quant/benchmark.csv (CSI 300).
// Then: npm run quant:adapt-history -- --prices data/quant/history.csv --benchmark data/quant/benchmark.csv --run
import fs from "node:fs";

const DEFAULT_CODES = "SH:688072,SZ:002384,SH:688017,SZ:300308,SZ:300502";
const [codesArg = DEFAULT_CODES, beg = "20260518", end = "20260703"] = process.argv.slice(2);

const MARKET_ID = { SH: "1", SZ: "0" };
const stockPairs = codesArg.split(",").map((entry) => {
  const [market, code] = entry.trim().split(":");
  const marketId = MARKET_ID[market?.toUpperCase() ?? ""];
  if (!marketId || !/^\d{6}$/.test(code ?? "")) {
    throw new Error(`Invalid code entry "${entry}", expected like SH:688072`);
  }
  return [`${marketId}.${code}`, code];
});
const benchmarkPairs = [["1.000300", "000300"]];

async function fetchDailyBars(secid, code) {
  const url =
    "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=" + secid +
    "&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61" +
    `&klt=101&fqt=1&beg=${beg}&end=${end}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();
  const klines = json?.data?.klines;
  if (!Array.isArray(klines)) throw new Error(`${code}: no klines (rc=${json?.rc})`);
  // kline fields: date,open,close,high,low,volume,amount,amplitude,pct_change,...
  return klines.map((line) => {
    const [date, open, close, high, low, volume, , , pct] = line.split(",");
    return [code, date, open, high, low, close, volume, pct].join(",");
  });
}

async function writeCsv(pairs, path) {
  const header = "code,date,open,high,low,close,volume,pct_change";
  const rows = [];
  for (const [secid, code] of pairs) {
    const bars = await fetchDailyBars(secid, code);
    console.log(`${code}: ${bars.length} bars`);
    rows.push(...bars);
  }
  fs.mkdirSync("data/quant", { recursive: true });
  fs.writeFileSync(path, `${header}\n${rows.join("\n")}\n`);
  console.log(`wrote ${path} (${rows.length} rows)`);
}

await writeCsv(stockPairs, "data/quant/history.csv");
await writeCsv(benchmarkPairs, "data/quant/benchmark.csv");
