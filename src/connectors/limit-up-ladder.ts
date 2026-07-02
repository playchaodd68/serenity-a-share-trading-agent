import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Eastmoney 涨停池/炸板池 topic endpoints (public, no auth), verified live 2026-07-02:
//   https://push2ex.eastmoney.com/getTopicZTPool  涨停池
//   https://push2ex.eastmoney.com/getTopicZBPool  炸板池 (touched limit-up but failed to hold)
// Pool row field glossary (from live responses):
//   c    股票代码            n    名称              m    市场 (0=深, 1=沪)
//   p    最新价, 单位为厘 (实际价格 × 1000, e.g. 5670 => 5.67 元)
//   zdp  涨跌幅(%)           amount 成交额(元)      hs   换手率(%)
//   lbc  连板数              fbt  首次封板时间 (HHMMSS 整数, e.g. 92500 => 09:25:00)
//   lbt  最后封板时间        fund 封单金额(元)      zbc  开板/炸板次数
//   hybk 行业板块            zttj {days, ct} 表示"days天ct板" (如 8天6板)
// 炸板池 rows carry fbt/zbc/hybk but no lbc/fund; we only use the pool count (tc).
// This connector provides deterministic trading-side crowding data only. In the user's
// methodology ladder height / limit-up waves are NEGATIVE crowding signals; it must never
// produce a composite score or ranking.

// Suspended/dirty rows may return "-" strings in numeric fields; tolerate any scalar and
// normalize in mapZtPoolRow so one dirty row cannot invalidate the whole pool.
const dirtyNumber = z.union([z.number(), z.string(), z.null()]).optional();
const dirtyString = z.union([z.string(), z.number(), z.null()]).optional();

const ZtPoolRow = z.object({
  c: z.string(),
  n: z.string(),
  zdp: dirtyNumber,
  lbc: dirtyNumber,
  fbt: dirtyNumber,
  lbt: dirtyNumber,
  fund: dirtyNumber,
  zbc: dirtyNumber,
  hybk: dirtyString,
});

// Non-trading days return { tc: 0, pool: [] }; be tolerant of a null data envelope too.
const PoolResponse = z.object({
  rc: z.number(),
  data: z
    .object({
      tc: z.number(),
      qdate: z.number(),
      pool: z.array(ZtPoolRow).nullable().optional(),
    })
    .nullable(),
});

export type ZtPoolRowData = z.infer<typeof ZtPoolRow>;

export interface LimitUpStock {
  code: string;
  name: string;
  industry: string;
  pctChange: number | null;
  /** 连板数 (lbc); a stock in the 涨停池 is at least 首板, so dirty rows default to 1. */
  height: number;
  /** 封单金额, 元 (fund); null when the endpoint returns a dirty value. */
  sealAmount: number | null;
  /** 开板/炸板次数 (zbc). */
  brokenCount: number;
  /** 首次封板时间 "HH:MM" (fbt); empty string when unavailable. */
  firstSealTime: string;
}

export interface LadderTier {
  height: number;
  stocks: LimitUpStock[];
}

export interface LimitUpLadderStats {
  limitUpCount: number;
  /** 炸板池数; null when the 炸板池 fetch failed (data unavailable, not zero). */
  brokenCount: number | null;
  /** 炸板率 = 炸板池数 / (涨停池数 + 炸板池数); null when both pools are empty or 炸板池 data is unavailable. */
  brokenRate: number | null;
  maxHeight: number;
}

export interface LimitUpLadderSnapshot {
  /** YYYY-MM-DD, from the endpoint's qdate; null qdate yields "unknown". */
  date: string;
  ladder: LadderTier[];
  stats: LimitUpLadderStats;
}

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

/** fbt/lbt are HHMMSS integers (92500 => "09:25"); returns "" when unavailable. */
function formatSealTime(value: number | string | null | undefined): string {
  const raw = asFiniteNumber(value);
  if (raw == null || raw < 0) return "";
  const padded = String(Math.trunc(raw)).padStart(6, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

export function parseZtPoolResponse(payload: unknown): { qdate: number | null; total: number; rows: ZtPoolRowData[] } {
  const parsed = PoolResponse.parse(payload);
  // rc≠0 is an API-level error (rate limiting, stale ut token, …) that arrives as HTTP 200
  // with data:null; it must fail loudly instead of masquerading as an empty pool.
  if (parsed.rc !== 0) throw new Error(`Eastmoney pool response error: rc=${parsed.rc}`);
  if (!parsed.data) return { qdate: null, total: 0, rows: [] };
  return { qdate: parsed.data.qdate, total: parsed.data.tc, rows: parsed.data.pool ?? [] };
}

export function mapZtPoolRow(row: ZtPoolRowData): LimitUpStock {
  return {
    code: row.c,
    name: row.n,
    industry: asText(row.hybk),
    pctChange: asFiniteNumber(row.zdp),
    height: asFiniteNumber(row.lbc) ?? 1,
    sealAmount: asFiniteNumber(row.fund),
    brokenCount: asFiniteNumber(row.zbc) ?? 0,
    firstSealTime: formatSealTime(row.fbt),
  };
}

export function computeBrokenRate(limitUpCount: number, brokenCount: number | null): number | null {
  if (brokenCount == null) return null;
  const denominator = limitUpCount + brokenCount;
  return denominator > 0 ? brokenCount / denominator : null;
}

function formatQdate(qdate: number | null): string {
  if (qdate == null) return "unknown";
  const text = String(qdate).padStart(8, "0");
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

export function buildLadderSnapshot(stocks: LimitUpStock[], brokenCount: number | null, qdate: number | null): LimitUpLadderSnapshot {
  const byHeight = new Map<number, LimitUpStock[]>();
  for (const stock of stocks) {
    byHeight.set(stock.height, [...(byHeight.get(stock.height) ?? []), stock]);
  }
  const ladder = [...byHeight.entries()]
    .sort(([left], [right]) => right - left)
    .map(([height, tierStocks]) => ({ height, stocks: tierStocks }));
  const maxHeight = ladder.length > 0 ? ladder[0].height : 0;
  return {
    date: formatQdate(qdate),
    ladder,
    stats: {
      limitUpCount: stocks.length,
      brokenCount,
      brokenRate: computeBrokenRate(stocks.length, brokenCount),
      maxHeight,
    },
  };
}

/** Accepts YYYYMMDD or YYYY-MM-DD; returns YYYYMMDD, or undefined for invalid input. */
export function normalizeLadderDate(input: string): string | undefined {
  const compact = input.trim().replaceAll("-", "");
  return /^\d{8}$/.test(compact) ? compact : undefined;
}

export interface PoolPage {
  total: number;
  qdate: number | null;
  rows: ZtPoolRowData[];
}

const POOL_PAGE_SIZE = 200;
const POOL_MAX_PAGES = 20;

// Exposed for deterministic tests: paginates (Pageindex is 0-based) until the reported
// pool size is reached, deduping by code. A failure on page 0 throws (no data at all);
// a failure on a later page keeps the partial rows and warns instead of discarding them.
export async function collectPoolPages(fetchPage: (page: number) => Promise<PoolPage>): Promise<{ qdate: number | null; rows: ZtPoolRowData[] }> {
  const seen = new Map<string, ZtPoolRowData>();
  let qdate: number | null = null;
  let reportedTotal = Number.POSITIVE_INFINITY;
  for (let page = 0; page < POOL_MAX_PAGES; page += 1) {
    if (seen.size >= reportedTotal) break;
    let result: PoolPage;
    try {
      result = await fetchPage(page);
    } catch (error) {
      if (page === 0) throw error;
      console.warn(
        `Eastmoney pool pagination stopped at page ${page} with ${seen.size} rows; continuing with partial coverage. Reason: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
    qdate = qdate ?? result.qdate;
    reportedTotal = result.total;
    if (result.rows.length === 0) break;
    for (const row of result.rows) {
      if (!seen.has(row.c)) seen.set(row.c, row);
    }
  }
  return { qdate, rows: [...seen.values()] };
}

// push2ex has no working delayed mirror (push2exdelay.eastmoney.com answers 302, verified
// 2026-07-02), so unlike eastmoney.ts the host list has a single entry; resilience comes
// from the fetch->curl fallback in fetchPoolJson. Keep the loop so a mirror can be added.
const POOL_HOSTS = ["push2ex.eastmoney.com"];
const POOL_UT = "7eea3edcaed734bea9cbfc24409ed989";

type PoolKind = "getTopicZTPool" | "getTopicZBPool" | "getTopicDTPool";

function poolUrl(host: string, kind: PoolKind, date: string, page: number): string {
  const params = new URLSearchParams({
    ut: POOL_UT,
    dpt: "wz.ztzt",
    Pageindex: String(page),
    pagesize: String(POOL_PAGE_SIZE),
    sort: "fbt:asc",
    date,
  });
  return `https://${host}/${kind}?${params.toString()}`;
}

// push2ex can accept the TCP connection then drip/stall the body when rate-limited; without
// a deadline the whole request chain (and the Feishu callback awaiting it) hangs forever.
const POOL_TIMEOUT_MS = 15_000;

async function fetchPoolJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 serenity-a-share-trading-agent/1.0", referer: "https://quote.eastmoney.com/" },
      signal: AbortSignal.timeout(POOL_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Eastmoney pool request failed: ${response.status}`);
    return response.json();
  } catch (_error) {
    const { stdout } = await execFileAsync(
      "curl",
      ["-L", "-s", "--max-time", String(POOL_TIMEOUT_MS / 1000), "-A", "Mozilla/5.0 serenity-a-share-trading-agent/1.0", url],
      { maxBuffer: 8 * 1024 * 1024, timeout: POOL_TIMEOUT_MS + 5_000 },
    );
    return JSON.parse(stdout);
  }
}

async function fetchPoolPage(kind: PoolKind, date: string, page: number): Promise<PoolPage> {
  let lastError: unknown;
  for (const host of POOL_HOSTS) {
    try {
      const parsed = parseZtPoolResponse(await fetchPoolJson(poolUrl(host, kind, date, page)));
      return { total: parsed.total, qdate: parsed.qdate, rows: parsed.rows };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function defaultPoolDate(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Fetch 涨停池 + 炸板池 and assemble the ladder snapshot.
 * @param date YYYYMMDD (already normalized); defaults to today. Non-trading days return an empty snapshot.
 */
export async function fetchLimitUpLadder(date?: string): Promise<LimitUpLadderSnapshot> {
  const poolDate = date ?? defaultPoolDate();
  const zt = await collectPoolPages((page) => fetchPoolPage("getTopicZTPool", poolDate, page));
  // 炸板率 only needs the pool count; a 炸板池 failure degrades to broken=null (rendered as
  // n/a, never a fake 0.0%) with a warning instead of dropping the whole ladder.
  let brokenCount: number | null = null;
  try {
    brokenCount = (await fetchPoolPage("getTopicZBPool", poolDate, 0)).total;
  } catch (error) {
    console.warn(`Eastmoney 炸板池 fetch failed; broken rate omitted. Reason: ${error instanceof Error ? error.message : String(error)}`);
  }
  return buildLadderSnapshot(zt.rows.map(mapZtPoolRow), brokenCount, zt.qdate);
}

const REPORT_MAX_STOCKS_PER_TIER = 8;
const LADDER_DISCLAIMER = "提示: 连板高度/涨停潮是交易侧拥挤度的负面信号，本数据仅供观察，不构成买入依据。";

function formatSealAmount(sealAmount: number | null): string {
  if (sealAmount == null) return "封单n/a";
  if (sealAmount >= 100_000_000) return `封单${(sealAmount / 100_000_000).toFixed(2)}亿`;
  return `封单${(sealAmount / 10_000).toFixed(0)}万`;
}

function formatTierLine(tier: LadderTier): string {
  const label = tier.height <= 1 ? "首板" : `${tier.height}连板`;
  const shown = tier.stocks.slice(0, REPORT_MAX_STOCKS_PER_TIER).map((stock) => {
    const industry = stock.industry ? `[${stock.industry}]` : "";
    const broken = stock.brokenCount > 0 ? ` 炸板${stock.brokenCount}次` : "";
    const sealTime = stock.firstSealTime ? ` 首封${stock.firstSealTime}` : "";
    return `${stock.code} ${stock.name}${industry} ${formatSealAmount(stock.sealAmount)}${broken}${sealTime}`;
  });
  const overflow = tier.stocks.length > REPORT_MAX_STOCKS_PER_TIER ? ` …等${tier.stocks.length}家` : "";
  return `${label}(${tier.stocks.length}家): ${shown.join("；")}${overflow}`;
}

export function formatLadderReport(snapshot: LimitUpLadderSnapshot): string {
  const { stats } = snapshot;
  if (stats.limitUpCount === 0) {
    return [`**涨停池/连板梯队（${snapshot.date}）**`, "", "今日涨停池为空（非交易日或数据未更新）。", "", LADDER_DISCLAIMER].join("\n");
  }
  const rateText = stats.brokenRate == null ? "n/a" : `${(stats.brokenRate * 100).toFixed(1)}%`;
  const brokenText = stats.brokenCount == null ? "n/a" : String(stats.brokenCount);
  return [
    `**涨停池/连板梯队（${snapshot.date}）**`,
    "",
    `涨停 ${stats.limitUpCount} 家 | 炸板 ${brokenText} 家 | 炸板率 ${rateText} | 最高连板 ${stats.maxHeight}`,
    "",
    ...snapshot.ladder.map(formatTierLine),
    "",
    LADDER_DISCLAIMER,
  ].join("\n");
}
