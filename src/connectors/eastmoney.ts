import { z } from "zod";
import type { AShareStock, SourceRecord } from "../types.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { FALLBACK_A_SHARE_FIXTURE } from "./a-share-fixture.js";
import { writeJsonFile } from "../utils/fs.js";

const execFileAsync = promisify(execFile);

// Suspended (停牌) rows return "-" strings in numeric fields; tolerate any scalar and
// normalize in mapEastmoneyStock so one dirty row cannot invalidate a whole page.
const dirtyNumber = z.union([z.number(), z.string(), z.null()]).optional();
const dirtyString = z.union([z.string(), z.number(), z.null()]).optional();

const EastmoneyRow = z.object({
  f2: dirtyNumber,
  f3: dirtyNumber,
  f9: dirtyNumber,
  f12: z.string(),
  f14: z.string(),
  f20: dirtyNumber,
  f21: dirtyNumber,
  f23: dirtyNumber,
  f62: dirtyNumber,
  f100: dirtyString,
  f102: dirtyString,
  f103: dirtyString,
});

function asFiniteNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: string | number | null | undefined): string {
  if (typeof value === "string") return value === "-" ? "" : value;
  if (typeof value === "number") return String(value);
  return "";
}

const EastmoneyResponse = z.object({
  rc: z.number(),
  data: z.object({
    total: z.number(),
    diff: z.array(EastmoneyRow),
  }),
});

const EastmoneyKlineResponse = z.object({
  data: z
    .object({
      klines: z.array(z.string()),
    })
    .nullable(),
});

export const EASTMONEY_SOURCE: SourceRecord = {
  id: "EASTMONEY-A-SHARE-SNAPSHOT",
  title: "Eastmoney A-share market snapshot endpoint",
  tier: "P2",
  sourceType: "industry",
  publisher: "Eastmoney",
  observedAt: new Date().toISOString().slice(0, 10),
  url: "https://push2.eastmoney.com/api/qt/clist/get",
  summary: "Public A-share market snapshot used for screen inputs: code, name, market cap, PE, turnover, industry, concepts, and main net inflow.",
  evidenceTags: ["a-share", "market-data", "snapshot"],
};

export function mapEastmoneyStock(row: z.infer<typeof EastmoneyRow>): AShareStock {
  return {
    code: row.f12,
    name: row.f14,
    latestPrice: asFiniteNumber(row.f2),
    pctChange: asFiniteNumber(row.f3),
    totalMarketCap: asFiniteNumber(row.f20),
    floatMarketCap: asFiniteNumber(row.f21),
    pe: asFiniteNumber(row.f9),
    turnover: asFiniteNumber(row.f23),
    mainNetInflow: asFiniteNumber(row.f62),
    industry: asText(row.f100),
    region: asText(row.f102),
    concept: asText(row.f103),
  };
}

// Eastmoney caps the clist endpoint at ~100 rows per page regardless of pz, so full
// coverage requires real pagination. A single-page fetch silently shrinks the blind
// channel's scan universe to the top of the sort — exactly the kind of hidden coverage
// gap the methodology forbids.
const EASTMONEY_PAGE_SIZE = 100;
const EASTMONEY_MAX_PAGES = 200;
// push2 is the realtime host; push2delay serves ~15-min delayed quotes and is a
// sufficient fallback for daily screening when push2 is unreachable (e.g. local
// proxy/fake-ip DNS interception dropping the primary host).
const SNAPSHOT_HOSTS = ["push2.eastmoney.com", "push2delay.eastmoney.com"];

function snapshotUrl(host: string, page: number): string {
  const fields = "f12,f14,f2,f3,f20,f21,f9,f23,f62,f100,f102,f103";
  const params = new URLSearchParams({
    pn: String(page),
    pz: String(EASTMONEY_PAGE_SIZE),
    po: "1",
    np: "1",
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fid: "f3",
    fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23",
    fields,
  });
  return `https://${host}/api/qt/clist/get?${params.toString()}`;
}

async function fetchSnapshotPage(page: number): Promise<SnapshotPage> {
  let lastError: unknown;
  for (const host of SNAPSHOT_HOSTS) {
    try {
      const parsed = EastmoneyResponse.parse(await fetchEastmoneyJson(snapshotUrl(host, page)));
      return { total: parsed.data.total, stocks: parsed.data.diff.map(mapEastmoneyStock) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface SnapshotPage {
  total: number;
  stocks: AShareStock[];
}

// Exposed for deterministic tests: paginates via the injected page fetcher until the
// requested limit or the reported universe size is reached, deduping by code. A failure
// on the first page throws (no live data at all); a failure on a later page keeps the
// partial coverage already fetched and warns instead of discarding it.
export async function collectSnapshotPages(
  fetchPage: (page: number) => Promise<SnapshotPage>,
  limit: number,
): Promise<AShareStock[]> {
  const seen = new Map<string, AShareStock>();
  let reportedTotal = Number.POSITIVE_INFINITY;
  for (let page = 1; page <= EASTMONEY_MAX_PAGES; page += 1) {
    if (seen.size >= limit || seen.size >= reportedTotal) break;
    let result: SnapshotPage;
    try {
      result = await fetchPage(page);
    } catch (error) {
      if (page === 1) throw error;
      console.warn(
        `Eastmoney pagination stopped at page ${page} with ${seen.size} rows; continuing with partial coverage. Reason: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
    reportedTotal = result.total;
    if (result.stocks.length === 0) break;
    for (const stock of result.stocks) {
      if (!seen.has(stock.code)) seen.set(stock.code, stock);
    }
  }
  return [...seen.values()].slice(0, limit);
}

export async function fetchAShareSnapshot(limit = 800): Promise<AShareStock[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 10_000);
  try {
    const stocks = await collectSnapshotPages(fetchSnapshotPage, cappedLimit);
    if (stocks.length === 0) throw new Error("Eastmoney snapshot returned no rows.");
    // Persist the code/name universe as the entity dictionary for report claim
    // extraction (best-effort; only on broad fetches so a tiny page never shrinks it).
    if (stocks.length >= 1000) {
      writeJsonFile(
        path.resolve("data/a-share-universe.json"),
        stocks.map((stock) => ({ code: stock.code, name: stock.name })),
      ).catch(() => undefined);
    }
    return stocks;
  } catch (error) {
    if (process.env.A_SHARE_DISABLE_FIXTURE === "true") throw error;
    console.warn(`Eastmoney live snapshot unavailable; using fallback fixture with kline refresh. Reason: ${error instanceof Error ? error.message : String(error)}`);
    return refreshFallbackQuotes(FALLBACK_A_SHARE_FIXTURE.slice(0, limit));
  }
}

function secidForCode(code: string): string {
  return `${code.startsWith("6") ? "1" : "0"}.${code}`;
}

async function refreshFallbackQuotes(stocks: AShareStock[]): Promise<AShareStock[]> {
  const refreshed = await Promise.all(stocks.map((stock) => refreshStockQuote(stock).catch(() => stock)));
  return applyLocalResearchMetrics(refreshed);
}

async function refreshStockQuote(stock: AShareStock): Promise<AShareStock> {
  const params = new URLSearchParams({
    secid: secidForCode(stock.code),
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
    klt: "101",
    fqt: "1",
    beg: "20260101",
    end: "20500101",
    lmt: "1",
  });
  const parsed = EastmoneyKlineResponse.parse(await fetchEastmoneyJson(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${params.toString()}`));
  const latest = parsed.data?.klines.at(-1);
  if (!latest) return stock;
  const [, , close, , , , , , pctChange, , turnover] = latest.split(",");
  return {
    ...stock,
    latestPrice: Number.isFinite(Number(close)) ? Number(close) : stock.latestPrice,
    pctChange: Number.isFinite(Number(pctChange)) ? Number(pctChange) : stock.pctChange,
    turnover: Number.isFinite(Number(turnover)) ? Number(turnover) : stock.turnover,
  };
}

async function applyLocalResearchMetrics(stocks: AShareStock[]): Promise<AShareStock[]> {
  const metrics = await loadLatestLocalResearchMetrics();
  if (metrics.size === 0) return stocks;
  return stocks.map((stock) => {
    const item = metrics.get(stock.code);
    if (!item) return stock;
    return {
      ...stock,
      latestPrice: stock.latestPrice ?? item.lastClose,
    };
  });
}

async function loadLatestLocalResearchMetrics(): Promise<Map<string, { lastClose: number }>> {
  try {
    const files = (await fs.readdir("reports"))
      .filter((file) => /^serenity-research-data-.*\.json$/.test(file))
      .sort()
      .reverse();
    for (const file of files) {
      const raw = JSON.parse(await fs.readFile(path.join("reports", file), "utf8")) as {
        candidates?: Array<{ code?: string; metrics?: { last_close?: number } }>;
      };
      const values = new Map<string, { lastClose: number }>();
      for (const candidate of raw.candidates ?? []) {
        if (candidate.code && Number.isFinite(candidate.metrics?.last_close)) values.set(candidate.code, { lastClose: Number(candidate.metrics?.last_close) });
      }
      if (values.size > 0) return values;
    }
    return new Map();
  } catch {
    return new Map();
  }
}

async function fetchEastmoneyJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 serenity-a-share-trading-agent/1.0", referer: "https://quote.eastmoney.com/" },
    });
    if (!response.ok) throw new Error(`Eastmoney request failed: ${response.status}`);
    return response.json();
  } catch (_error) {
    const { stdout } = await execFileAsync("curl", ["-L", "-s", "-A", "Mozilla/5.0 serenity-a-share-trading-agent/1.0", url], {
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  }
}
