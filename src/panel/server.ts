import http, { type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config.js";
import {
  createTradingChatSession,
  normalizeChatSessionId,
  promptTradingChatSession,
  saveChatSession,
  type TradingChatSession,
} from "../chatbot/chatbot.js";
import {
  fetchLimitUpLadder,
  type LimitUpLadderSnapshot,
  type LimitUpLadderStats,
  normalizeLadderDate,
} from "../connectors/limit-up-ladder.js";
import { loadPortfolio } from "../portfolio/portfolio.js";
import { type DecisionLogEntry, loadDecisionLog, summarizeDecisionLog } from "../research/decision-log.js";
import { loadGraveyard, summarizeGraveyard } from "../research/graveyard.js";
import { type FfdReportStatus, listFfdReportManifests } from "../research/report-library.js";
import { buildResolutionCalibration, loadResolutions } from "../research/resolution.js";
import { loadWatchlist } from "../research/watchlist.js";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";
import { createPanelAuth } from "./auth.js";
import type {
  CalibrationSnapshot,
  GraveyardEntry,
  GraveyardReason,
  ScreenRun,
  WatchlistEntry,
  WatchlistStatus,
} from "../types.js";
import type { QuantBacktestResult } from "../quant/backtest.js";

// Read-only panel API + static hosting for panel/dist, layered on the proven
// node:http pattern from src/chatbot/chatbot.ts. The legacy /chat, /reset and
// /health routes keep their chat-server semantics (reusing the chatbot module
// exports); every /api/* route is GET-only, side-effect free (except the ladder
// disk cache) and reads runtime artifacts directly from disk. Missing artifact
// files always degrade to null / empty payloads — the panel is a read-only
// mirror and must render empty states instead of crashing.

export interface PanelServerOptions {
  /** Listening port; defaults to CHAT_SERVER_PORT (8788). Use 0 in tests. */
  port?: number;
  /** Project root that holds data/, runs/, reports/ and panel/dist. */
  rootDir?: string;
  /** Static assets directory; defaults to <rootDir>/panel/dist. */
  staticDir?: string;
  /** 面板密码（测试注入用）；默认读 PANEL_PASSWORD，缺省则面板完全开放。 */
  password?: string;
  /** Injectable ladder fetcher for tests; defaults to fetchLimitUpLadder. */
  fetchLadder?: (date?: string) => Promise<LimitUpLadderSnapshot>;
  /** Injectable clock for "today" decisions; defaults to () => new Date(). */
  now?: () => Date;
}

const RUN_ID_PATTERN = /^screen-[A-Za-z0-9_-]{1,120}$/;
const LADDER_MEMO_TTL_MS = 60_000;
const DEFAULT_GRAVEYARD_LIMIT = 100;
const MAX_GRAVEYARD_LIMIT = 500;
const DEFAULT_SCREENS_LIMIT = 50;
const MAX_SCREENS_LIMIT = 200;
const DEFAULT_LADDER_HISTORY_DAYS = 20;
const MAX_LADDER_HISTORY_DAYS = 120;

const WATCHLIST_STATUSES: WatchlistStatus[] = ["evidence-needed", "investigating", "validated", "downgraded", "archived"];
const GRAVEYARD_REASONS: GraveyardReason[] = ["below-entry-bar", "kill-triggered", "downgraded", "manual-reject"];
const FFD_REPORT_STATUSES: FfdReportStatus[] = ["downloaded", "staged", "accepted", "rejected", "archived"];
const DECISION_STATUSES = ["pending", "resolved"] as const;

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

// Local copies of the chatbot's private HTTP helpers (readJsonBody/sendJson are
// not exported from src/chatbot/chatbot.ts and that shared file is out of scope
// for this slice; keep both in sync if the pattern changes).
async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > 2_000_000) throw new Error("Request body is too large.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendText(response: ServerResponse, status: number, contentType: string, body: string | Buffer, extraHeaders: Record<string, string> = {}): void {
  response.writeHead(status, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    ...extraHeaders,
  });
  response.end(body);
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function compactDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function dashedDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

interface ScreenRunMeta {
  runId: string;
  generatedAt: string;
  candidateCount: number;
  totalStocksScanned: number;
  sourceCount: number;
}

interface PanelPaths {
  rootDir: string;
  reportsDir: string;
  watchlistPath: string;
  graveyardPath: string;
  decisionLogPath: string;
  portfolioPath: string;
  calibrationPath: string;
  resolutionsPath: string;
  backtestPath: string;
  ladderDir: string;
  ffdProcessedDir: string;
  packageJsonPath: string;
}

function panelPaths(rootDir: string): PanelPaths {
  return {
    rootDir,
    reportsDir: path.join(rootDir, "reports"),
    watchlistPath: path.join(rootDir, "data", "watchlist.json"),
    graveyardPath: path.join(rootDir, "data", "graveyard.json"),
    decisionLogPath: path.join(rootDir, "data", "decision-log.json"),
    portfolioPath: path.join(rootDir, "data", "portfolio.json"),
    calibrationPath: path.join(rootDir, "runs", "calibration-latest.json"),
    resolutionsPath: path.join(rootDir, "runs", "resolutions.json"),
    backtestPath: path.join(rootDir, "runs", "quant-backtest-latest.json"),
    ladderDir: path.join(rootDir, "runs", "ladder"),
    ffdProcessedDir: path.join(rootDir, "reports", "ffd", "processed"),
    packageJsonPath: path.join(rootDir, "package.json"),
  };
}

async function listScreenRunFiles(reportsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(reportsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.startsWith("screen-") && entry.name.endsWith(".json"))
      .map((entry) => path.join(reportsDir, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function listScreenRunMetas(reportsDir: string): Promise<ScreenRunMeta[]> {
  const files = await listScreenRunFiles(reportsDir);
  const metas: ScreenRunMeta[] = [];
  for (const file of files) {
    const run = await readJsonFile<ScreenRun | null>(file, null);
    if (!run?.runId || !run.generatedAt) continue;
    metas.push({
      runId: run.runId,
      generatedAt: run.generatedAt,
      candidateCount: Array.isArray(run.candidates) ? run.candidates.length : 0,
      totalStocksScanned: run.totalStocksScanned ?? 0,
      sourceCount: run.sourceCount ?? 0,
    });
  }
  return metas.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

async function readScreenRun(paths: PanelPaths, runId: string): Promise<ScreenRun | null> {
  return readJsonFile<ScreenRun | null>(path.join(paths.reportsDir, `${runId}.json`), null);
}

async function readLadderCache(paths: PanelPaths, dashed: string): Promise<LimitUpLadderSnapshot | null> {
  return readJsonFile<LimitUpLadderSnapshot | null>(path.join(paths.ladderDir, `${dashed}.json`), null);
}

async function listLadderHistory(paths: PanelPaths, days: number): Promise<Array<{ date: string; stats: LimitUpLadderStats }>> {
  let names: string[];
  try {
    names = await fs.readdir(paths.ladderDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const dates = names
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 10))
    .sort()
    .slice(-days);
  const history: Array<{ date: string; stats: LimitUpLadderStats }> = [];
  for (const date of dates) {
    const snapshot = await readLadderCache(paths, date);
    if (snapshot?.stats) history.push({ date, stats: snapshot.stats });
  }
  return history;
}

function watchlistByStatus(entries: WatchlistEntry[]): Record<WatchlistStatus, number> {
  const byStatus = Object.fromEntries(WATCHLIST_STATUSES.map((status) => [status, 0])) as Record<WatchlistStatus, number>;
  for (const entry of entries) {
    if (byStatus[entry.status] != null) byStatus[entry.status] += 1;
  }
  return byStatus;
}

async function buildOverview(paths: PanelPaths, now: () => Date) {
  const [metas, watchlist, calibration, portfolioResult] = await Promise.all([
    listScreenRunMetas(paths.reportsDir),
    loadWatchlist(paths.watchlistPath),
    readJsonFile<CalibrationSnapshot | null>(paths.calibrationPath, null),
    loadPortfolio(paths.portfolioPath),
  ]);
  const latestMeta = metas[0];
  const latestRun = latestMeta ? await readScreenRun(paths, latestMeta.runId) : null;
  const dueForReview = [...watchlist]
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, 8)
    .map((entry) => ({
      code: entry.code,
      name: entry.name,
      status: entry.status,
      score: entry.score,
      nextReviewAt: entry.nextReviewAt,
      hasCandidateP0: entry.evidenceState.hasCandidateP0,
      riskEvidenceCount: entry.evidenceState.riskEvidenceCount,
    }));
  const todayDashed = dashedDate(compactDate(now()));
  const ladderSnapshot = await readLadderCache(paths, todayDashed);
  return {
    latestRun:
      latestRun && latestMeta
        ? { ...latestMeta, hotThemeDowngrades: latestRun.hotThemeDowngrades ?? [] }
        : null,
    watchlist: { total: watchlist.length, byStatus: watchlistByStatus(watchlist), dueForReview },
    calibration,
    portfolio: portfolioResult.portfolio
      ? { updatedAt: portfolioResult.portfolio.updatedAt, positionCount: portfolioResult.portfolio.positions.length }
      : null,
    ladder: ladderSnapshot ? { ...ladderSnapshot.stats, date: ladderSnapshot.date } : null,
  };
}

async function buildDataFreshness(paths: PanelPaths) {
  const [metas, calibration, backtest, watchlist] = await Promise.all([
    listScreenRunMetas(paths.reportsDir),
    readJsonFile<CalibrationSnapshot | null>(paths.calibrationPath, null),
    readJsonFile<QuantBacktestResult | null>(paths.backtestPath, null),
    loadWatchlist(paths.watchlistPath),
  ]);
  const watchlistUpdatedAt = watchlist.reduce<string | null>(
    (latest, entry) => (latest == null || entry.lastSeenAt > latest ? entry.lastSeenAt : latest),
    null,
  );
  return {
    latestScreenRunId: metas[0]?.runId ?? null,
    latestScreenAt: metas[0]?.generatedAt ?? null,
    calibrationAt: calibration?.generatedAt ?? null,
    backtestAt: backtest?.generatedAt ?? null,
    watchlistUpdatedAt,
  };
}

async function buildPortfolioView(paths: PanelPaths) {
  const { portfolio } = await loadPortfolio(paths.portfolioPath);
  if (!portfolio) return null;
  const [watchlist, graveyard, metas] = await Promise.all([
    loadWatchlist(paths.watchlistPath),
    loadGraveyard(paths.graveyardPath),
    listScreenRunMetas(paths.reportsDir),
  ]);
  const latestRun = metas[0] ? await readScreenRun(paths, metas[0].runId) : null;
  const watchlistByCode = new Map(watchlist.map((entry) => [entry.code, entry]));
  const latestScoreByCode = new Map((latestRun?.candidates ?? []).map((candidate) => [candidate.stock.code, candidate.score]));
  const graveyardByCode = new Map<string, GraveyardEntry>();
  for (const entry of graveyard) {
    const existing = graveyardByCode.get(entry.code);
    if (!existing || entry.buriedAt > existing.buriedAt) graveyardByCode.set(entry.code, entry);
  }
  return {
    updatedAt: portfolio.updatedAt,
    positions: portfolio.positions.map((position) => {
      const watched = watchlistByCode.get(position.code);
      const buried = graveyardByCode.get(position.code);
      return {
        code: position.code,
        name: position.name ?? watched?.name ?? "",
        note: position.note ?? "",
        watchlist: watched
          ? { status: watched.status, score: watched.score, confidence: watched.confidence, nextReviewAt: watched.nextReviewAt }
          : undefined,
        latestScreenScore: latestScoreByCode.get(position.code),
        graveyard: buried ? { reason: buried.reason, buriedAt: buried.buriedAt, detail: buried.detail } : undefined,
      };
    }),
  };
}

async function serveStatic(response: ServerResponse, staticDir: string, rawPathname: string): Promise<void> {
  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    sendText(response, 400, "text/plain; charset=utf-8", "非法请求路径。");
    return;
  }
  const staticRoot = path.resolve(staticDir);
  let rootExists = true;
  try {
    await fs.access(staticRoot);
  } catch {
    rootExists = false;
  }
  if (!rootExists) {
    sendText(
      response,
      200,
      "text/plain; charset=utf-8",
      "面板前端尚未构建：先运行 npm run panel:build 生成 panel/dist，再访问本页面。API 仍可用（/api/*）。",
    );
    return;
  }

  // Path traversal guard: resolve against the static root, then verify the
  // result never escapes it (handles ../, encoded %2e%2e and absolute paths).
  const resolved = path.resolve(staticRoot, `.${path.posix.normalize(`/${pathname}`)}`);
  if (resolved !== staticRoot && !resolved.startsWith(staticRoot + path.sep)) {
    sendText(response, 403, "text/plain; charset=utf-8", "禁止访问静态目录以外的文件。");
    return;
  }

  const indexPath = path.join(staticRoot, "index.html");
  let filePath = resolved === staticRoot ? indexPath : resolved;
  let stat = await fs.stat(filePath).catch(() => null);
  if (stat?.isDirectory()) {
    filePath = path.join(filePath, "index.html");
    stat = await fs.stat(filePath).catch(() => null);
  }
  if (!stat?.isFile()) {
    // SPA fallback: extension-less routes belong to the client router.
    if (path.extname(filePath) === "" || filePath === indexPath) {
      const indexStat = await fs.stat(indexPath).catch(() => null);
      if (indexStat?.isFile()) {
        sendText(response, 200, STATIC_CONTENT_TYPES[".html"]!, await fs.readFile(indexPath), { "cache-control": "no-cache" });
        return;
      }
    }
    sendText(response, 404, "text/plain; charset=utf-8", "未找到该静态资源。");
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  const contentType = STATIC_CONTENT_TYPES[extension] ?? "application/octet-stream";
  const cacheControl = pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  sendText(response, 200, contentType, await fs.readFile(filePath), { "cache-control": cacheControl });
}

export async function startPanelServer(options: PanelServerOptions = {}): Promise<http.Server> {
  const config = getConfig();
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const staticDir = options.staticDir ?? path.join(rootDir, "panel", "dist");
  const paths = panelPaths(rootDir);
  const fetchLadder = options.fetchLadder ?? fetchLimitUpLadder;
  const now = options.now ?? (() => new Date());
  const port = options.port ?? config.chatPort;

  // 密码优先取测试注入的 options.password，默认读环境变量（dotenv 已在 config.ts 加载）。
  const auth = await createPanelAuth({
    password: options.password ?? process.env.PANEL_PASSWORD,
    sessionsPath: path.join(rootDir, "runs", "panel-sessions.json"),
    now,
  });
  if (!auth.required) {
    console.warn("[panel] 未配置 PANEL_PASSWORD，面板处于完全开放状态；如需密码保护请在 .env 中设置。");
  }

  const sessions = new Map<string, TradingChatSession>();
  let ladderMemo: { key: string; at: number; snapshot: LimitUpLadderSnapshot } | null = null;

  async function getSession(inputSessionId?: string): Promise<TradingChatSession> {
    const sessionId = normalizeChatSessionId(inputSessionId);
    const existing = sessions.get(sessionId);
    if (existing) return existing;
    const session = await createTradingChatSession(sessionId);
    sessions.set(sessionId, session);
    return session;
  }

  async function handleLadder(response: ServerResponse, dateParam: string | null): Promise<void> {
    const todayCompact = compactDate(now());
    const compact = dateParam ? normalizeLadderDate(dateParam) : todayCompact;
    if (!compact) {
      sendJson(response, 400, { error: "date 参数无效，应为 YYYYMMDD 或 YYYY-MM-DD。" });
      return;
    }
    const dashed = dashedDate(compact);
    if (compact !== todayCompact) {
      const cached = await readLadderCache(paths, dashed);
      if (!cached) {
        sendJson(response, 404, { error: `未找到 ${dashed} 的梯队缓存；历史日期只读缓存，不做现场抓取。` });
        return;
      }
      sendJson(response, 200, cached);
      return;
    }
    if (ladderMemo && ladderMemo.key === compact && Date.now() - ladderMemo.at < LADDER_MEMO_TTL_MS) {
      sendJson(response, 200, ladderMemo.snapshot);
      return;
    }
    try {
      const snapshot = await fetchLadder(compact);
      await writeJsonFile(path.join(paths.ladderDir, `${dashed}.json`), snapshot);
      ladderMemo = { key: compact, at: Date.now(), snapshot };
      sendJson(response, 200, snapshot);
    } catch (error) {
      // Degrade to today's disk cache instead of failing the whole page.
      const cached = await readLadderCache(paths, dashed);
      if (cached) {
        sendJson(response, 200, cached);
        return;
      }
      sendJson(response, 502, { error: `涨停池抓取失败：${error instanceof Error ? error.message : String(error)}` });
    }
  }

  async function handleApi(url: URL, response: ServerResponse): Promise<boolean> {
    const pathname = url.pathname;

    if (pathname === "/api/health") {
      const packageJson = await readJsonFile<{ version?: string } | null>(paths.packageJsonPath, null);
      sendJson(response, 200, {
        ok: true,
        version: packageJson?.version ?? "0.0.0",
        dataFreshness: await buildDataFreshness(paths),
      });
      return true;
    }

    if (pathname === "/api/overview") {
      sendJson(response, 200, await buildOverview(paths, now));
      return true;
    }

    if (pathname === "/api/screens") {
      const limit = clampInt(url.searchParams.get("limit"), DEFAULT_SCREENS_LIMIT, 1, MAX_SCREENS_LIMIT);
      sendJson(response, 200, (await listScreenRunMetas(paths.reportsDir)).slice(0, limit));
      return true;
    }

    const screenMatch = pathname.match(/^\/api\/screens\/([^/]+)(\/report)?$/);
    if (screenMatch) {
      let runId: string;
      try {
        runId = decodeURIComponent(screenMatch[1]!);
      } catch {
        sendJson(response, 400, { error: "runId 参数无法解码。" });
        return true;
      }
      if (!RUN_ID_PATTERN.test(runId)) {
        sendJson(response, 400, { error: "runId 参数非法：仅允许 screen- 前缀加字母、数字、下划线与连字符。" });
        return true;
      }
      if (screenMatch[2]) {
        try {
          const markdown = await fs.readFile(path.join(paths.reportsDir, `${runId}.md`), "utf8");
          sendText(response, 200, "text/markdown; charset=utf-8", markdown);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            sendJson(response, 404, { error: `未找到 ${runId} 的 markdown 报告。` });
          } else {
            throw error;
          }
        }
        return true;
      }
      sendJson(response, 200, await readScreenRun(paths, runId));
      return true;
    }

    if (pathname === "/api/watchlist") {
      sendJson(response, 200, await loadWatchlist(paths.watchlistPath));
      return true;
    }

    if (pathname === "/api/graveyard") {
      const reasonParam = url.searchParams.get("reason");
      if (reasonParam && !GRAVEYARD_REASONS.includes(reasonParam as GraveyardReason)) {
        sendJson(response, 400, { error: `reason 参数非法，可选：${GRAVEYARD_REASONS.join(", ")}。` });
        return true;
      }
      const limit = clampInt(url.searchParams.get("limit"), DEFAULT_GRAVEYARD_LIMIT, 1, MAX_GRAVEYARD_LIMIT);
      const offset = clampInt(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
      const graveyard = await loadGraveyard(paths.graveyardPath);
      const filtered = reasonParam ? graveyard.filter((entry) => entry.reason === reasonParam) : graveyard;
      const sorted = [...filtered].sort((a, b) => b.buriedAt.localeCompare(a.buriedAt));
      sendJson(response, 200, {
        summary: summarizeGraveyard(graveyard),
        total: sorted.length,
        entries: sorted.slice(offset, offset + limit),
      });
      return true;
    }

    if (pathname === "/api/calibration") {
      sendJson(response, 200, await readJsonFile<CalibrationSnapshot | null>(paths.calibrationPath, null));
      return true;
    }

    if (pathname === "/api/resolutions") {
      const resolutions = await loadResolutions(paths.resolutionsPath);
      sendJson(response, 200, {
        calibration: resolutions.length > 0 ? buildResolutionCalibration(resolutions) : null,
        resolutions,
      });
      return true;
    }

    if (pathname === "/api/decision-log") {
      const statusParam = url.searchParams.get("status");
      if (statusParam && !DECISION_STATUSES.includes(statusParam as (typeof DECISION_STATUSES)[number])) {
        sendJson(response, 400, { error: `status 参数非法，可选：${DECISION_STATUSES.join(", ")}。` });
        return true;
      }
      const entries = await loadDecisionLog(paths.decisionLogPath);
      const filtered = statusParam ? entries.filter((entry: DecisionLogEntry) => entry.status === statusParam) : entries;
      sendJson(response, 200, { summary: summarizeDecisionLog(entries), entries: filtered });
      return true;
    }

    if (pathname === "/api/backtest/latest") {
      sendJson(response, 200, await readJsonFile<QuantBacktestResult | null>(paths.backtestPath, null));
      return true;
    }

    if (pathname === "/api/ladder") {
      await handleLadder(response, url.searchParams.get("date"));
      return true;
    }

    if (pathname === "/api/ladder/history") {
      const days = clampInt(url.searchParams.get("days"), DEFAULT_LADDER_HISTORY_DAYS, 1, MAX_LADDER_HISTORY_DAYS);
      sendJson(response, 200, await listLadderHistory(paths, days));
      return true;
    }

    if (pathname === "/api/portfolio") {
      sendJson(response, 200, await buildPortfolioView(paths));
      return true;
    }

    if (pathname === "/api/reports/ffd") {
      const statusParam = url.searchParams.get("status");
      if (statusParam && !FFD_REPORT_STATUSES.includes(statusParam as FfdReportStatus)) {
        sendJson(response, 400, { error: `status 参数非法，可选：${FFD_REPORT_STATUSES.join(", ")}。` });
        return true;
      }
      const manifests = await listFfdReportManifests(paths.ffdProcessedDir);
      sendJson(response, 200, statusParam ? manifests.filter((manifest) => manifest.status === statusParam) : manifests);
      return true;
    }

    return false;
  }

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") {
        sendJson(response, 204, {});
        return;
      }

      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
        if (request.method !== "GET") {
          sendJson(response, 405, { error: "面板 API 仅支持 GET。" });
          return;
        }
        if (await handleApi(url, response)) return;
        sendJson(response, 404, { error: "Not found" });
        return;
      }

      // Legacy chat-server routes keep their original semantics.
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          modelProvider: config.modelProvider,
          modelName: config.modelName,
          sessions: sessions.size,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/chat") {
        const body = await readJsonBody<{ message?: string; sessionId?: string }>(request);
        const session = await getSession(body.sessionId);
        const result = await promptTradingChatSession(session, body.message ?? "");
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "POST" && url.pathname === "/reset") {
        const body = await readJsonBody<{ sessionId?: string }>(request);
        const session = await getSession(body.sessionId);
        session.agent.reset();
        await saveChatSession(session);
        sendJson(response, 200, { ok: true, sessionId: session.sessionId });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }

      await serveStatic(response, staticDir, url.pathname);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("already processing") ? 409 : 500;
      sendJson(response, status, { error: message });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`Serenity panel server listening on http://localhost:${(server.address() as { port: number }).port}`);
  return server;
}
