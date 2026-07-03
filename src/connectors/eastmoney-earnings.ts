import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Eastmoney 数据中心业绩披露 endpoints (public, no auth), verified live via curl 2026-07-03:
//   https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_PUBLIC_OP_NEWPREDICT   业绩预告
//   https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_FCI_PERFORMANCEE       业绩快报
// Shared query params: columns=ALL, pageNumber/pageSize, sortColumns/sortTypes, filter.
// filter 语法 (verified): 子句直接拼接，如 (PREDICT_FINANCE_CODE="004")(NOTICE_DATE>='2026-07-01')
// 和 (SECURITY_CODE in ("603618","300750"))。
// 预告字段: SECURITY_CODE/SECURITY_NAME_ABBR/NOTICE_DATE(公告日)/REPORT_DATE(报告期末)/
//   PREDICT_TYPE(预增|预盈|扭亏|预减|预亏|略增|略减|续盈|续亏|减亏|增亏|不确定)/
//   PREDICT_FINANCE_CODE(004=归母净利润, 005=扣非——同一公告两行, 只取 004 防止事件重复计数)/
//   PREDICT_AMT_LOWER|UPPER(预告净利润区间, 元; 仅披露增速区间时为 null)/ADD_AMP_LOWER|UPPER(同比%)/
//   PREYEAR_SAME_PERIOD(去年同期净利润, 元)/PREDICT_CONTENT(预告原文)。
// 快报字段: PARENT_NETPROFIT(归母净利润, 元)/PARENT_NETPROFIT_SQ(去年同期)/JLRTBZCL(净利同比%)/
//   TOTAL_OPERATE_INCOME(营收)/YSTZ(营收同比%)/BASIC_EPS/QDATE("2026Q1")。
// 空结果集返回 success:false + code 9201 ("返回数据为空") —— 这是合法的空答案, 不是 API 故障。
// 本 connector 只输出确定性披露数据与类型化行; 不做任何评分/加权。

// Dirty rows may return "-" strings in numeric fields; tolerate any scalar and normalize
// in the row mappers so one dirty row cannot invalidate a whole page.
const dirtyNumber = z.union([z.number(), z.string(), z.null()]).optional();
const dirtyString = z.union([z.string(), z.number(), z.null()]).optional();

const PreannouncementRow = z.object({
  SECURITY_CODE: z.string(),
  SECURITY_NAME_ABBR: z.string(),
  REPORT_DATE: z.string(),
  NOTICE_DATE: z.string(),
  PREDICT_TYPE: dirtyString,
  PREDICT_FINANCE: dirtyString,
  PREDICT_AMT_LOWER: dirtyNumber,
  PREDICT_AMT_UPPER: dirtyNumber,
  ADD_AMP_LOWER: dirtyNumber,
  ADD_AMP_UPPER: dirtyNumber,
  PREYEAR_SAME_PERIOD: dirtyNumber,
  PREDICT_CONTENT: dirtyString,
});

const ExpressRow = z.object({
  SECURITY_CODE: z.string(),
  SECURITY_NAME_ABBR: z.string(),
  REPORT_DATE: z.string(),
  NOTICE_DATE: z.string(),
  BASIC_EPS: dirtyNumber,
  PARENT_NETPROFIT: dirtyNumber,
  PARENT_NETPROFIT_SQ: dirtyNumber,
  TOTAL_OPERATE_INCOME: dirtyNumber,
  YSTZ: dirtyNumber,
  JLRTBZCL: dirtyNumber,
});

const DatacenterResponse = z.object({
  success: z.boolean(),
  message: z.union([z.string(), z.null()]).optional(),
  code: z.number().optional(),
  result: z
    .object({
      pages: z.number(),
      count: z.number(),
      data: z.array(z.unknown()),
    })
    .nullable(),
});

// Verified live 2026-07-03: an empty result set is an API-level "failure" with this code.
const DATACENTER_EMPTY_CODE = 9201;

export function parseDatacenterEnvelope(payload: unknown): { pages: number; count: number; rows: unknown[] } {
  const parsed = DatacenterResponse.parse(payload);
  if (!parsed.success || !parsed.result) {
    if (parsed.code === DATACENTER_EMPTY_CODE) return { pages: 0, count: 0, rows: [] };
    throw new Error(`Eastmoney datacenter response error: code=${parsed.code ?? "unknown"} ${parsed.message ?? ""}`.trim());
  }
  return { pages: parsed.result.pages, count: parsed.result.count, rows: parsed.result.data };
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

/** Datacenter dates arrive as "2026-07-04 00:00:00"; keep the calendar day only. */
function isoDay(value: string): string {
  return value.slice(0, 10);
}

export interface EarningsPreannouncement {
  code: string;
  name: string;
  /** 报告期末 YYYY-MM-DD (REPORT_DATE), e.g. 2026-06-30 = 中报。 */
  periodEnd: string;
  /** 预告类型: 预增/预盈/扭亏/预减/预亏/略增/略减/续盈/续亏/减亏/增亏/不确定。 */
  type: string;
  /** 预告口径 (PREDICT_FINANCE); 请求端已过滤为归母净利润 (004)。 */
  indicator: string;
  /** 预告净利润下限, 元; 仅披露增速区间的预告为 null。 */
  forecastNetProfitLow: number | null;
  /** 预告净利润上限, 元。 */
  forecastNetProfitHigh: number | null;
  /** 同比变动下限, %。 */
  changePctLow: number | null;
  /** 同比变动上限, %。 */
  changePctHigh: number | null;
  /** 去年同期归母净利润, 元 (ESP/扭亏判定的上下文)。 */
  prevYearSamePeriodNetProfit: number | null;
  /** 公告日 YYYY-MM-DD (NOTICE_DATE)。 */
  announceDate: string;
  /** 预告原文摘录 (PREDICT_CONTENT)。 */
  content: string;
}

export interface EarningsExpress {
  code: string;
  name: string;
  /** 报告期末 YYYY-MM-DD (REPORT_DATE)。 */
  periodEnd: string;
  /** 快报归母净利润 (累计口径), 元。 */
  netProfit: number | null;
  /** 净利润同比增长率, % (JLRTBZCL)。负基数下符号语义失真, 消费方须配合 netProfit 判定。 */
  netProfitYoyPct: number | null;
  /** 去年同期归母净利润, 元 (PARENT_NETPROFIT_SQ)。 */
  prevYearSamePeriodNetProfit: number | null;
  /** 营业总收入, 元。 */
  revenue: number | null;
  /** 营收同比, % (YSTZ)。 */
  revenueYoyPct: number | null;
  /** 基本每股收益, 元。 */
  eps: number | null;
  /** 公告日 YYYY-MM-DD (NOTICE_DATE)。 */
  announceDate: string;
}

export function mapPreannouncementRow(row: unknown): EarningsPreannouncement | null {
  const parsed = PreannouncementRow.safeParse(row);
  if (!parsed.success) return null;
  const data = parsed.data;
  return {
    code: data.SECURITY_CODE,
    name: data.SECURITY_NAME_ABBR,
    periodEnd: isoDay(data.REPORT_DATE),
    type: asText(data.PREDICT_TYPE),
    indicator: asText(data.PREDICT_FINANCE),
    forecastNetProfitLow: asFiniteNumber(data.PREDICT_AMT_LOWER),
    forecastNetProfitHigh: asFiniteNumber(data.PREDICT_AMT_UPPER),
    changePctLow: asFiniteNumber(data.ADD_AMP_LOWER),
    changePctHigh: asFiniteNumber(data.ADD_AMP_UPPER),
    prevYearSamePeriodNetProfit: asFiniteNumber(data.PREYEAR_SAME_PERIOD),
    announceDate: isoDay(data.NOTICE_DATE),
    content: asText(data.PREDICT_CONTENT),
  };
}

export function mapExpressRow(row: unknown): EarningsExpress | null {
  const parsed = ExpressRow.safeParse(row);
  if (!parsed.success) return null;
  const data = parsed.data;
  return {
    code: data.SECURITY_CODE,
    name: data.SECURITY_NAME_ABBR,
    periodEnd: isoDay(data.REPORT_DATE),
    netProfit: asFiniteNumber(data.PARENT_NETPROFIT),
    netProfitYoyPct: asFiniteNumber(data.JLRTBZCL),
    prevYearSamePeriodNetProfit: asFiniteNumber(data.PARENT_NETPROFIT_SQ),
    revenue: asFiniteNumber(data.TOTAL_OPERATE_INCOME),
    revenueYoyPct: asFiniteNumber(data.YSTZ),
    eps: asFiniteNumber(data.BASIC_EPS),
    announceDate: isoDay(data.NOTICE_DATE),
  };
}

export interface EarningsQuery {
  /** 起始公告日 (含) YYYY-MM-DD, 过滤 NOTICE_DATE >=。 */
  dateFrom: string;
  /** 可选: 限定 6 位股票代码清单 (走 SECURITY_CODE in (...) filter)。 */
  codes?: string[];
}

const DATACENTER_HOST = "datacenter-web.eastmoney.com";
const EARNINGS_PAGE_SIZE = 500;
// 500/page × 40 pages = 2 万行, 覆盖一个完整财报季的预告/快报总量仍有富余。
const EARNINGS_MAX_PAGES = 40;
// 归母净利润口径; 同一公告的 005(扣非) 行会把一个事件数成两个。
const PREDICT_FINANCE_PARENT_NET = "004";

// filter 子句拼进 URL, 输入必须白名单校验, 防 filter 注入 (系统边界验证)。
function validatedQuery(query: EarningsQuery): { dateFrom: string; codes: string[] | undefined } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(query.dateFrom)) {
    throw new Error(`Invalid dateFrom (expected YYYY-MM-DD): ${query.dateFrom}`);
  }
  if (query.codes == null) return { dateFrom: query.dateFrom, codes: undefined };
  const codes = [...new Set(query.codes.map((code) => code.trim()))];
  const invalid = codes.filter((code) => !/^\d{6}$/.test(code));
  if (invalid.length > 0 || codes.length === 0) {
    throw new Error(`Invalid codes (expected 6-digit stock codes): ${invalid.join(", ") || "(empty)"}`);
  }
  return { dateFrom: query.dateFrom, codes };
}

function datacenterUrl(reportName: string, filterClauses: string[], sortColumns: string, page: number): string {
  const params = new URLSearchParams({
    reportName,
    columns: "ALL",
    pageNumber: String(page),
    pageSize: String(EARNINGS_PAGE_SIZE),
    sortColumns,
    sortTypes: sortColumns
      .split(",")
      .map(() => "-1")
      .join(","),
    source: "WEB",
    client: "WEB",
    filter: filterClauses.join(""),
  });
  return `https://${DATACENTER_HOST}/api/data/v1/get?${params.toString()}`;
}

function codesClause(codes: string[] | undefined): string[] {
  if (!codes) return [];
  return [`(SECURITY_CODE in (${codes.map((code) => `"${code}"`).join(",")}))`];
}

export function preannouncementPageUrl(query: EarningsQuery, page: number): string {
  const { dateFrom, codes } = validatedQuery(query);
  return datacenterUrl(
    "RPT_PUBLIC_OP_NEWPREDICT",
    [`(PREDICT_FINANCE_CODE="${PREDICT_FINANCE_PARENT_NET}")`, `(NOTICE_DATE>='${dateFrom}')`, ...codesClause(codes)],
    "NOTICE_DATE,SECURITY_CODE",
    page,
  );
}

export function expressPageUrl(query: EarningsQuery, page: number): string {
  const { dateFrom, codes } = validatedQuery(query);
  return datacenterUrl("RPT_FCI_PERFORMANCEE", [`(NOTICE_DATE>='${dateFrom}')`, ...codesClause(codes)], "NOTICE_DATE,SECURITY_CODE", page);
}

export interface DatacenterPage<T> {
  pages: number;
  count: number;
  rows: T[];
}

// Exposed for deterministic tests: paginates (pageNumber is 1-based) until the reported
// count is reached, deduping by key. A failure on page 1 throws (no data at all); a
// failure on a later page keeps the partial rows and warns instead of discarding them.
export async function collectDatacenterPages<T>(fetchPage: (page: number) => Promise<DatacenterPage<T>>, keyOf: (row: T) => string): Promise<T[]> {
  const seen = new Map<string, T>();
  let reportedCount = Number.POSITIVE_INFINITY;
  let reportedPages = Number.POSITIVE_INFINITY;
  for (let page = 1; page <= EARNINGS_MAX_PAGES; page += 1) {
    if (seen.size >= reportedCount || page > reportedPages) break;
    let result: DatacenterPage<T>;
    try {
      result = await fetchPage(page);
    } catch (error) {
      if (page === 1) throw error;
      console.warn(
        `Eastmoney datacenter pagination stopped at page ${page} with ${seen.size} rows; continuing with partial coverage. Reason: ${error instanceof Error ? error.message : String(error)}`,
      );
      break;
    }
    reportedCount = result.count;
    reportedPages = result.pages;
    if (result.rows.length === 0) break;
    for (const row of result.rows) {
      const key = keyOf(row);
      if (!seen.has(key)) seen.set(key, row);
    }
  }
  return [...seen.values()];
}

// datacenter-web can accept the TCP connection then stall the body when rate-limited;
// without a deadline the whole daily-run chain hangs forever.
const EARNINGS_TIMEOUT_MS = 15_000;

async function fetchDatacenterJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 serenity-a-share-trading-agent/1.0", referer: "https://data.eastmoney.com/" },
      signal: AbortSignal.timeout(EARNINGS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Eastmoney datacenter request failed: ${response.status}`);
    return response.json();
  } catch (_error) {
    const { stdout } = await execFileAsync(
      "curl",
      ["-L", "-s", "--max-time", String(EARNINGS_TIMEOUT_MS / 1000), "-A", "Mozilla/5.0 serenity-a-share-trading-agent/1.0", url],
      { maxBuffer: 8 * 1024 * 1024, timeout: EARNINGS_TIMEOUT_MS + 5_000 },
    );
    return JSON.parse(stdout);
  }
}

async function fetchMappedPage<T>(url: string, mapRow: (row: unknown) => T | null): Promise<DatacenterPage<T>> {
  const envelope = parseDatacenterEnvelope(await fetchDatacenterJson(url));
  return {
    pages: envelope.pages,
    count: envelope.count,
    rows: envelope.rows.map(mapRow).filter((row): row is T => row != null),
  };
}

function byAnnounceDateDesc<T extends { announceDate: string; code: string }>(left: T, right: T): number {
  return right.announceDate.localeCompare(left.announceDate) || left.code.localeCompare(right.code);
}

/**
 * 业绩预告 (法定披露, 中小创强制)。归母净利润口径 (PREDICT_FINANCE_CODE=004)。
 * 同一 code+periodEnd 的修正公告会以不同 announceDate 各占一行, 由消费方决定去重语义。
 */
export async function fetchEarningsPreannouncements(query: EarningsQuery): Promise<EarningsPreannouncement[]> {
  const rows = await collectDatacenterPages(
    (page) => fetchMappedPage(preannouncementPageUrl(query, page), mapPreannouncementRow),
    (row) => `${row.code}|${row.periodEnd}|${row.announceDate}`,
  );
  return rows.sort(byAnnounceDateDesc);
}

/** 业绩快报 (法定披露)。结构与预告对称: 快报净利润/同比/公告日。 */
export async function fetchEarningsExpress(query: EarningsQuery): Promise<EarningsExpress[]> {
  const rows = await collectDatacenterPages(
    (page) => fetchMappedPage(expressPageUrl(query, page), mapExpressRow),
    (row) => `${row.code}|${row.periodEnd}|${row.announceDate}`,
  );
  return rows.sort(byAnnounceDateDesc);
}
