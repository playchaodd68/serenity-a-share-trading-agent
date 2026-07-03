import { z } from "zod";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { writeJsonFile } from "../utils/fs.js";

const execFileAsync = promisify(execFile);

// 一致预期快照滚动存档 (提案 §2c-5 / §5-P0 第5项)。
// 东财只有"当前"一致预期、没有历史序列 —— P1 的预期修正因子 (P1 四阶段/三指标交集)
// 需要 6-12 个月的自建快照库, 晚一天存就少一天历史, 因此从今天起每日落盘。
//
// F10 盈利预测 endpoint (public, 逐股接口), verified live via curl 2026-07-03:
//   https://emweb.securities.eastmoney.com/PC_HSF10/ProfitForecast/PageAjax?code=SZ300750
// 使用的 sections:
//   yctj_list 预测统计: YEAR / YEAR_MARK ("A"=实际, "E"=一致预期) / EPS / EPS_COUNT /
//              PARENT_NETPROFIT / PARENT_NETPROFIT_COUNT (预测机构家数)
//   pjtj      评级统计: DATE_TYPE_CODE (1=1月内 … 5=1年内) / COMPRE_RATING / RATING_ORG_NUM
// 无效代码返回 {"status":-1,"message":"股票代码不合法"} (HTTP 200)。
// 无分析师覆盖的股票返回 pjtj:[] 且 yctj_list 无 "E" 行 —— 这是 "缺失/uncovered" 态,
// 不是错误; 覆盖少绝不折算成低分 (提案铁律: 缺失 = 无信号)。
// 本模块只产出确定性快照数据, 不做任何评分/加权。

const dirtyNumber = z.union([z.number(), z.string(), z.null()]).optional();
const dirtyString = z.union([z.string(), z.number(), z.null()]).optional();

const YctjRow = z.object({
  SECURITY_NAME_ABBR: dirtyString,
  YEAR: dirtyNumber,
  YEAR_MARK: dirtyString,
  EPS: dirtyNumber,
  EPS_COUNT: dirtyNumber,
  PARENT_NETPROFIT: dirtyNumber,
  PARENT_NETPROFIT_COUNT: dirtyNumber,
});

const PjtjRow = z.object({
  DATE_TYPE_CODE: dirtyNumber,
  COMPRE_RATING: dirtyString,
  RATING_ORG_NUM: dirtyNumber,
});

const ProfitForecastPayload = z.object({
  status: z.number().optional(),
  message: z.string().optional(),
  pjtj: z.array(z.unknown()).nullable().optional(),
  yctj_list: z.array(z.unknown()).nullable().optional(),
});

export type ConsensusSnapshotStatus = "ok" | "uncovered" | "failed";

export interface ConsensusSnapshot {
  code: string;
  name: string | null;
  /** 快照日 YYYY-MM-DD (预期修正序列的时间轴)。 */
  asOf: string;
  /** ok=有一致预期; uncovered=接口正常但无分析师覆盖 (缺失态); failed=该股抓取失败。 */
  status: ConsensusSnapshotStatus;
  /** FY1 净利润预测机构家数; 覆盖 <4 家时消费方应按缺失态处理 (§2c-5), 此处只记录。 */
  analystCount: number | null;
  /** FY1 一致预期归母净利润, 元。 */
  consensusNetProfitFY1: number | null;
  /** FY2 一致预期归母净利润, 元。 */
  consensusNetProfitFY2: number | null;
  /** FY1 一致预期 EPS, 元。 */
  consensusEpsFY1: number | null;
  fy1Year: number | null;
  fy2Year: number | null;
  /** 综合评级, 取 "3月内" 窗口 —— 对齐提案 §2b-6 分析师数据 ≤90 天时效硬过滤。 */
  rating: string | null;
  /** 3月内参与评级机构家数 (评级的覆盖上下文)。 */
  ratingOrgCount3m: number | null;
  /** 仅 status=failed 时携带失败原因。 */
  error?: string;
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

/** F10 接口的代码前缀: 6xxxxx=沪, 4/8/9 开头=北交所, 其余=深。 */
export function f10SecurityCode(code: string): string {
  if (code.startsWith("6")) return `SH${code}`;
  if (/^[489]/.test(code)) return `BJ${code}`;
  return `SZ${code}`;
}

/** 解析 PageAjax 响应为一份快照; 无效载荷/status=-1 抛错 (由 collect 捕获记 failed)。 */
export function mapConsensusSnapshot(code: string, payload: unknown, asOf: string): ConsensusSnapshot {
  const parsed = ProfitForecastPayload.parse(payload);
  if (parsed.status != null && parsed.status !== 0) {
    throw new Error(`Eastmoney F10 ProfitForecast error: status=${parsed.status} ${parsed.message ?? ""}`.trim());
  }
  const yctjRows = (parsed.yctj_list ?? []).map((row) => YctjRow.safeParse(row)).flatMap((result) => (result.success ? [result.data] : []));
  const estimateRows = yctjRows
    .filter((row) => asText(row.YEAR_MARK) === "E")
    .map((row) => ({
      year: asFiniteNumber(row.YEAR),
      eps: asFiniteNumber(row.EPS),
      netProfit: asFiniteNumber(row.PARENT_NETPROFIT),
      count: asFiniteNumber(row.PARENT_NETPROFIT_COUNT) ?? asFiniteNumber(row.EPS_COUNT),
    }))
    .sort((left, right) => (left.year ?? Number.POSITIVE_INFINITY) - (right.year ?? Number.POSITIVE_INFINITY));
  const fy1 = estimateRows[0];
  const fy2 = estimateRows[1];
  const rating3m = (parsed.pjtj ?? [])
    .map((row) => PjtjRow.safeParse(row))
    .flatMap((result) => (result.success ? [result.data] : []))
    .find((row) => asFiniteNumber(row.DATE_TYPE_CODE) === 3);
  const name = yctjRows.map((row) => asText(row.SECURITY_NAME_ABBR)).find((value) => value.length > 0) ?? null;
  const hasConsensus = fy1 != null && (fy1.netProfit != null || fy1.eps != null);
  return {
    code,
    name,
    asOf,
    status: hasConsensus ? "ok" : "uncovered",
    analystCount: fy1?.count ?? null,
    consensusNetProfitFY1: fy1?.netProfit ?? null,
    consensusNetProfitFY2: fy2?.netProfit ?? null,
    consensusEpsFY1: fy1?.eps ?? null,
    fy1Year: fy1?.year ?? null,
    fy2Year: fy2?.year ?? null,
    rating: rating3m ? asText(rating3m.COMPRE_RATING) || null : null,
    ratingOrgCount3m: rating3m ? asFiniteNumber(rating3m.RATING_ORG_NUM) : null,
  };
}

function failedSnapshot(code: string, asOf: string, error: unknown): ConsensusSnapshot {
  return {
    code,
    name: null,
    asOf,
    status: "failed",
    analystCount: null,
    consensusNetProfitFY1: null,
    consensusNetProfitFY2: null,
    consensusEpsFY1: null,
    fy1Year: null,
    fy2Year: null,
    rating: null,
    ratingOrgCount3m: null,
    error: error instanceof Error ? error.message : String(error),
  };
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// F10 是逐股接口: 串行批次 + 批内小并发 (≤4) + 批间间隔, 避免触发限频。
const CONSENSUS_CONCURRENCY = 4;
const CONSENSUS_BATCH_GAP_MS = 300;

export interface CollectConsensusOptions {
  concurrency?: number;
  batchGapMs?: number;
  asOf?: string;
}

// Exposed for deterministic tests: dedupes codes (keeping input order), fans out in
// batches of ≤concurrency, and converts per-code failures into status="failed" rows so
// one bad stock can never break the whole chain (单股失败记缺失, 不断链)。
export async function collectConsensusSnapshots(
  codes: string[],
  fetchOne: (code: string) => Promise<ConsensusSnapshot>,
  options: CollectConsensusOptions = {},
): Promise<ConsensusSnapshot[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? CONSENSUS_CONCURRENCY, CONSENSUS_CONCURRENCY));
  const batchGapMs = options.batchGapMs ?? CONSENSUS_BATCH_GAP_MS;
  const asOf = options.asOf ?? localDateString(new Date());
  const uniqueCodes = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  const snapshots: ConsensusSnapshot[] = [];
  for (let start = 0; start < uniqueCodes.length; start += concurrency) {
    const batch = uniqueCodes.slice(start, start + concurrency);
    const settled = await Promise.all(
      batch.map(async (code) => {
        try {
          return await fetchOne(code);
        } catch (error) {
          return failedSnapshot(code, asOf, error);
        }
      }),
    );
    snapshots.push(...settled);
    const hasMore = start + concurrency < uniqueCodes.length;
    if (hasMore && batchGapMs > 0) await new Promise((resolve) => setTimeout(resolve, batchGapMs));
  }
  return snapshots;
}

// emweb can accept the TCP connection then stall when rate-limited; keep the same
// 15s deadline + fetch→curl fallback as the other eastmoney connectors.
const CONSENSUS_TIMEOUT_MS = 15_000;

async function fetchProfitForecastJson(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 serenity-a-share-trading-agent/1.0", referer: "https://emweb.securities.eastmoney.com/" },
      signal: AbortSignal.timeout(CONSENSUS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Eastmoney F10 request failed: ${response.status}`);
    return response.json();
  } catch (_error) {
    const { stdout } = await execFileAsync(
      "curl",
      ["-L", "-s", "--max-time", String(CONSENSUS_TIMEOUT_MS / 1000), "-A", "Mozilla/5.0 serenity-a-share-trading-agent/1.0", url],
      { maxBuffer: 8 * 1024 * 1024, timeout: CONSENSUS_TIMEOUT_MS + 5_000 },
    );
    return JSON.parse(stdout);
  }
}

function profitForecastUrl(code: string): string {
  const params = new URLSearchParams({ code: f10SecurityCode(code) });
  return `https://emweb.securities.eastmoney.com/PC_HSF10/ProfitForecast/PageAjax?${params.toString()}`;
}

/**
 * 逐股抓取当前一致预期 (F10 盈利预测)。仅覆盖有分析师覆盖的个股; 无覆盖股返回
 * uncovered (缺失态), 单股失败返回 failed, 均不断链。
 */
export async function fetchConsensusSnapshot(codes: string[]): Promise<ConsensusSnapshot[]> {
  const asOf = localDateString(new Date());
  return collectConsensusSnapshots(
    codes,
    async (code) => {
      if (!/^\d{6}$/.test(code)) throw new Error(`Invalid stock code: ${code}`);
      return mapConsensusSnapshot(code, await fetchProfitForecastJson(profitForecastUrl(code)), asOf);
    },
    { asOf },
  );
}

export const CONSENSUS_SNAPSHOT_DIR = "data/consensus-snapshots";

export interface ConsensusArchiveResult {
  path: string;
  date: string;
  /** 当日文件已存在时为 true (幂等跳过, 未发起任何抓取)。 */
  skipped: boolean;
  snapshots: ConsensusSnapshot[] | null;
  counts?: { ok: number; uncovered: number; failed: number };
}

export interface ArchiveConsensusOptions {
  now?: Date;
  /** 测试注入点; 默认走 fetchConsensusSnapshot 实网抓取。 */
  fetchSnapshots?: (codes: string[]) => Promise<ConsensusSnapshot[]>;
}

/**
 * 一致预期快照滚动存档: 落盘 <dir>/<YYYY-MM-DD>.json, 当日已存在则跳过 (幂等)。
 * codes 的选择策略由调用方传入 —— cli 接线时建议取 watchlist + 持仓 + 最新批次候选 +
 * 证据补齐队列的并集: F10 为逐股接口, 全市场遍历既慢又触发限频, 只存跟踪池即可满足
 * P1 预期修正因子对历史序列的需要。
 */
export async function archiveConsensusSnapshots(
  codes: string[],
  dir: string = CONSENSUS_SNAPSHOT_DIR,
  options: ArchiveConsensusOptions = {},
): Promise<ConsensusArchiveResult> {
  const date = localDateString(options.now ?? new Date());
  const filePath = path.resolve(dir, `${date}.json`);
  try {
    await fs.access(filePath);
    return { path: filePath, date, skipped: true, snapshots: null };
  } catch {
    // 文件不存在, 继续抓取并写入。
  }
  const fetchSnapshots = options.fetchSnapshots ?? fetchConsensusSnapshot;
  const snapshots = await fetchSnapshots(codes);
  const counts = {
    ok: snapshots.filter((snapshot) => snapshot.status === "ok").length,
    uncovered: snapshots.filter((snapshot) => snapshot.status === "uncovered").length,
    failed: snapshots.filter((snapshot) => snapshot.status === "failed").length,
  };
  await writeJsonFile(filePath, {
    asOf: date,
    generatedAt: new Date().toISOString(),
    codeCount: snapshots.length,
    counts,
    snapshots,
  });
  return { path: filePath, date, skipped: false, snapshots, counts };
}
