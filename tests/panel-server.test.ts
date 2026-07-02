import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type http from "node:http";
import type { AddressInfo } from "node:net";
import { startPanelServer } from "../src/panel/server.js";
import type { LimitUpLadderSnapshot } from "../src/connectors/limit-up-ladder.js";
import type { GraveyardEntry, ScreenRun, WatchlistEntry } from "../src/types.js";

const TODAY = "2026-07-02";
const TODAY_COMPACT = "20260702";

function ladderFixture(date: string): LimitUpLadderSnapshot {
  return {
    date,
    ladder: [
      { height: 3, stocks: [{ code: "600001", name: "三连板", industry: "光模块", pctChange: 10, height: 3, sealAmount: 120_000_000, brokenCount: 0, firstSealTime: "09:31" }] },
      { height: 1, stocks: [{ code: "600002", name: "首板", industry: "存储", pctChange: 10, height: 1, sealAmount: 30_000_000, brokenCount: 1, firstSealTime: "10:02" }] },
    ],
    stats: { limitUpCount: 2, brokenCount: 1, brokenRate: 1 / 3, maxHeight: 3 },
  };
}

function graveyardEntry(code: string, reason: GraveyardEntry["reason"], buriedAt: string): GraveyardEntry {
  return {
    code,
    name: `股票${code}`,
    reason,
    score: 60,
    confidence: "medium",
    matchedThemes: ["AI 光互连"],
    killedCriterionIds: [],
    detail: "测试条目",
    buriedAt,
  };
}

function watchlistEntry(code: string, nextReviewAt: string): WatchlistEntry {
  return {
    code,
    name: `股票${code}`,
    status: "investigating",
    score: 70,
    confidence: "medium",
    firstSeenAt: "2026-06-01T00:00:00.000Z",
    lastSeenAt: "2026-06-30T00:00:00.000Z",
    nextReviewAt,
    evidenceState: { hasCandidateP0: true, directEvidenceCount: 2, corroboratingEvidenceCount: 1, riskEvidenceCount: 1 },
    coverageGaps: ["缺产能数据"],
    nextActions: ["核对年报"],
    events: [],
  };
}

function screenRunFixture(runId: string, generatedAt: string): ScreenRun {
  return {
    runId,
    generatedAt,
    candidates: [],
    totalStocksScanned: 500,
    sourceCount: 12,
    hotThemeDowngrades: [],
  };
}

describe("panel server", () => {
  let emptyRoot: string;
  let emptyServer: http.Server;
  let emptyBase: string;

  let dataRoot: string;
  let dataServer: http.Server;
  let dataBase: string;
  let ladderFetchCount = 0;

  beforeAll(async () => {
    // 本机 .env 可能配置了真实 PANEL_PASSWORD（dotenv 已在 config.ts 加载）；
    // 删除它保证"未配置密码→完全开放"回归用例的确定性，密码一律走 options 注入。
    delete process.env.PANEL_PASSWORD;
    emptyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "panel-empty-"));
    emptyServer = await startPanelServer({
      port: 0,
      rootDir: emptyRoot,
      fetchLadder: async () => {
        throw new Error("network disabled in tests");
      },
      now: () => new Date(`${TODAY}T05:00:00.000Z`),
    });
    emptyBase = `http://127.0.0.1:${(emptyServer.address() as AddressInfo).port}`;

    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "panel-data-"));
    // reports fixtures
    await fs.mkdir(path.join(dataRoot, "reports"), { recursive: true });
    const runA = screenRunFixture("screen-2026-06-30T01-00-00-000Z", "2026-06-30T01:00:00.000Z");
    const runB = screenRunFixture("screen-2026-07-01T01-00-00-000Z", "2026-07-01T01:00:00.000Z");
    await fs.writeFile(path.join(dataRoot, "reports", `${runA.runId}.json`), JSON.stringify(runA));
    await fs.writeFile(path.join(dataRoot, "reports", `${runB.runId}.json`), JSON.stringify(runB));
    await fs.writeFile(path.join(dataRoot, "reports", `${runB.runId}.md`), "# 筛选报告\n\n正文");
    // data fixtures
    await fs.mkdir(path.join(dataRoot, "data"), { recursive: true });
    await fs.writeFile(
      path.join(dataRoot, "data", "graveyard.json"),
      JSON.stringify([
        graveyardEntry("000001", "below-entry-bar", "2026-06-01T00:00:00.000Z"),
        graveyardEntry("000002", "kill-triggered", "2026-06-02T00:00:00.000Z"),
        graveyardEntry("000003", "below-entry-bar", "2026-06-03T00:00:00.000Z"),
        graveyardEntry("000004", "downgraded", "2026-06-04T00:00:00.000Z"),
        graveyardEntry("000005", "below-entry-bar", "2026-06-05T00:00:00.000Z"),
      ]),
    );
    await fs.writeFile(
      path.join(dataRoot, "data", "watchlist.json"),
      JSON.stringify([watchlistEntry("300001", "2026-07-03T00:00:00.000Z"), watchlistEntry("300002", "2026-07-01T00:00:00.000Z")]),
    );
    await fs.writeFile(
      path.join(dataRoot, "data", "portfolio.json"),
      JSON.stringify({ updatedAt: "2026-07-01T00:00:00.000Z", positions: [{ code: "300001", name: "持仓一", note: "测试" }, { code: "000002", name: "持仓二" }] }),
    );
    // ladder history cache fixture
    await fs.mkdir(path.join(dataRoot, "runs", "ladder"), { recursive: true });
    await fs.writeFile(path.join(dataRoot, "runs", "ladder", "2026-06-27.json"), JSON.stringify(ladderFixture("2026-06-27")));
    // static dist fixture + a secret outside dist
    await fs.mkdir(path.join(dataRoot, "panel", "dist", "assets"), { recursive: true });
    await fs.writeFile(path.join(dataRoot, "panel", "dist", "index.html"), "<!doctype html><title>panel</title>");
    await fs.writeFile(path.join(dataRoot, "panel", "dist", "assets", "app.js"), "console.log(1)");
    await fs.writeFile(path.join(dataRoot, "panel", "secret.txt"), "TOP-SECRET");

    dataServer = await startPanelServer({
      port: 0,
      rootDir: dataRoot,
      fetchLadder: async () => {
        ladderFetchCount += 1;
        return ladderFixture(TODAY);
      },
      now: () => new Date(`${TODAY}T05:00:00.000Z`),
    });
    dataBase = `http://127.0.0.1:${(dataServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => emptyServer.close(resolve));
    await new Promise((resolve) => dataServer.close(resolve));
    await fs.rm(emptyRoot, { recursive: true, force: true });
    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  describe("empty states (missing artifacts must not 500)", () => {
    it("GET /api/health reports ok with empty freshness", async () => {
      const response = await fetch(`${emptyBase}/api/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.dataFreshness.latestScreenRunId).toBeNull();
      expect(body.dataFreshness.calibrationAt).toBeNull();
      expect(body.dataFreshness.backtestAt).toBeNull();
    });

    it("GET /api/overview returns nulls and zero counts", async () => {
      const response = await fetch(`${emptyBase}/api/overview`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.latestRun).toBeNull();
      expect(body.watchlist.total).toBe(0);
      expect(body.watchlist.dueForReview).toEqual([]);
      expect(body.watchlist.byStatus.validated).toBe(0);
      expect(body.calibration).toBeNull();
      expect(body.portfolio).toBeNull();
      expect(body.ladder).toBeNull();
    });

    it("GET /api/screens returns []", async () => {
      const response = await fetch(`${emptyBase}/api/screens`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it("GET /api/screens/:runId returns null for a missing run", async () => {
      const response = await fetch(`${emptyBase}/api/screens/screen-missing`);
      expect(response.status).toBe(200);
      expect(await response.json()).toBeNull();
    });

    it("GET /api/screens/:runId/report returns 404 for a missing markdown", async () => {
      const response = await fetch(`${emptyBase}/api/screens/screen-missing/report`);
      expect(response.status).toBe(404);
    });

    it("GET /api/watchlist returns []", async () => {
      const response = await fetch(`${emptyBase}/api/watchlist`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it("GET /api/graveyard returns empty summary", async () => {
      const response = await fetch(`${emptyBase}/api/graveyard`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.total).toBe(0);
      expect(body.entries).toEqual([]);
      expect(body.summary.total).toBe(0);
    });

    it("GET /api/calibration returns null", async () => {
      const response = await fetch(`${emptyBase}/api/calibration`);
      expect(response.status).toBe(200);
      expect(await response.json()).toBeNull();
    });

    it("GET /api/resolutions returns empty ledger", async () => {
      const response = await fetch(`${emptyBase}/api/resolutions`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ calibration: null, resolutions: [] });
    });

    it("GET /api/decision-log returns zero summary", async () => {
      const response = await fetch(`${emptyBase}/api/decision-log`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.summary.total).toBe(0);
      expect(body.entries).toEqual([]);
    });

    it("GET /api/backtest/latest returns null", async () => {
      const response = await fetch(`${emptyBase}/api/backtest/latest`);
      expect(response.status).toBe(200);
      expect(await response.json()).toBeNull();
    });

    it("GET /api/ladder/history returns []", async () => {
      const response = await fetch(`${emptyBase}/api/ladder/history`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it("GET /api/reports/ffd returns []", async () => {
      const response = await fetch(`${emptyBase}/api/reports/ffd`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });

    it("GET /api/portfolio returns null when holdings file is missing", async () => {
      const response = await fetch(`${emptyBase}/api/portfolio`);
      expect(response.status).toBe(200);
      expect(await response.json()).toBeNull();
    });

    it("serves a plain-text hint when panel/dist is not built", async () => {
      const response = await fetch(`${emptyBase}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(await response.text()).toContain("panel:build");
    });
  });

  describe("runId traversal protection", () => {
    it("rejects an encoded path traversal runId", async () => {
      const response = await fetch(`${dataBase}/api/screens/..%2F..%2Fdata%2Fportfolio`);
      expect(response.status).toBe(400);
    });

    it("rejects traversal on the report endpoint", async () => {
      const response = await fetch(`${dataBase}/api/screens/..%2F..%2Fpanel%2Fsecret/report`);
      expect(response.status).toBe(400);
    });

    it("rejects a runId containing dot segments", async () => {
      // "/api/screens/.." would be normalized away by URL parsing; a dotted
      // runId like "screen-.." must still be rejected by the whitelist.
      const response = await fetch(`${dataBase}/api/screens/screen-..`);
      expect(response.status).toBe(400);
    });
  });

  describe("screens", () => {
    it("lists screen runs newest first with meta fields", async () => {
      const response = await fetch(`${dataBase}/api/screens`);
      const body = await response.json();
      expect(body).toHaveLength(2);
      expect(body[0].runId).toBe("screen-2026-07-01T01-00-00-000Z");
      expect(body[0].candidateCount).toBe(0);
      expect(body[0].totalStocksScanned).toBe(500);
    });

    it("respects the limit parameter", async () => {
      const response = await fetch(`${dataBase}/api/screens?limit=1`);
      expect(await response.json()).toHaveLength(1);
    });

    it("returns a full run and its markdown report", async () => {
      const runId = "screen-2026-07-01T01-00-00-000Z";
      const run = await (await fetch(`${dataBase}/api/screens/${runId}`)).json();
      expect(run.runId).toBe(runId);
      const report = await fetch(`${dataBase}/api/screens/${runId}/report`);
      expect(report.status).toBe(200);
      expect(report.headers.get("content-type")).toContain("text/markdown");
      expect(await report.text()).toContain("筛选报告");
    });
  });

  describe("graveyard pagination", () => {
    it("paginates with default summary over the full set", async () => {
      const response = await fetch(`${dataBase}/api/graveyard?limit=2&offset=2`);
      const body = await response.json();
      expect(body.summary.total).toBe(5);
      expect(body.total).toBe(5);
      expect(body.entries).toHaveLength(2);
    });

    it("filters by reason and totals reflect the filter", async () => {
      const response = await fetch(`${dataBase}/api/graveyard?reason=below-entry-bar`);
      const body = await response.json();
      expect(body.total).toBe(3);
      expect(body.entries.every((entry: GraveyardEntry) => entry.reason === "below-entry-bar")).toBe(true);
    });

    it("rejects an unknown reason", async () => {
      const response = await fetch(`${dataBase}/api/graveyard?reason=oops`);
      expect(response.status).toBe(400);
    });
  });

  describe("ladder", () => {
    it("fetches today's ladder, writes the cache file, and debounces within 60s", async () => {
      const first = await fetch(`${dataBase}/api/ladder`);
      expect(first.status).toBe(200);
      const snapshot = await first.json();
      expect(snapshot.stats.limitUpCount).toBe(2);
      const second = await fetch(`${dataBase}/api/ladder?date=${TODAY_COMPACT}`);
      expect(second.status).toBe(200);
      expect(ladderFetchCount).toBe(1);
      const cached = JSON.parse(await fs.readFile(path.join(dataRoot, "runs", "ladder", `${TODAY}.json`), "utf8"));
      expect(cached.stats.maxHeight).toBe(3);
    });

    it("serves a historical date from cache without fetching", async () => {
      const before = ladderFetchCount;
      const response = await fetch(`${dataBase}/api/ladder?date=2026-06-27`);
      expect(response.status).toBe(200);
      expect((await response.json()).date).toBe("2026-06-27");
      expect(ladderFetchCount).toBe(before);
    });

    it("returns 404 on a historical cache miss", async () => {
      const response = await fetch(`${dataBase}/api/ladder?date=20200101`);
      expect(response.status).toBe(404);
    });

    it("rejects an invalid date", async () => {
      const response = await fetch(`${dataBase}/api/ladder?date=not-a-date`);
      expect(response.status).toBe(400);
    });

    it("lists ladder history snapshots", async () => {
      const response = await fetch(`${dataBase}/api/ladder/history?days=20`);
      const body = await response.json();
      expect(body.length).toBeGreaterThanOrEqual(2);
      expect(body[0].date <= body[body.length - 1].date).toBe(true);
      expect(body[0].stats.limitUpCount).toBeDefined();
    });
  });

  describe("overview and portfolio joins", () => {
    it("aggregates the overview from fixtures", async () => {
      const body = await (await fetch(`${dataBase}/api/overview`)).json();
      expect(body.latestRun.runId).toBe("screen-2026-07-01T01-00-00-000Z");
      expect(body.watchlist.total).toBe(2);
      expect(body.watchlist.byStatus.investigating).toBe(2);
      expect(body.watchlist.dueForReview[0].code).toBe("300002");
      expect(body.watchlist.dueForReview[0].hasCandidateP0).toBe(true);
      expect(body.portfolio.positionCount).toBe(2);
    });

    it("joins portfolio rows against watchlist and graveyard", async () => {
      const body = await (await fetch(`${dataBase}/api/portfolio`)).json();
      expect(body.updatedAt).toBe("2026-07-01T00:00:00.000Z");
      const first = body.positions.find((position: { code: string }) => position.code === "300001");
      expect(first.watchlist.status).toBe("investigating");
      const second = body.positions.find((position: { code: string }) => position.code === "000002");
      expect(second.graveyard.reason).toBe("kill-triggered");
      expect(first.graveyard).toBeUndefined();
    });
  });

  describe("static hosting", () => {
    it("serves index.html at / with the html content type", async () => {
      const response = await fetch(`${dataBase}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain("panel");
    });

    it("serves assets with the correct content type", async () => {
      const response = await fetch(`${dataBase}/assets/app.js`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("javascript");
    });

    it("falls back to index.html for SPA routes", async () => {
      const response = await fetch(`${dataBase}/ladder`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    it("blocks encoded traversal out of the dist directory", async () => {
      const response = await fetch(`${dataBase}/..%2Fsecret.txt`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      const text = await response.text();
      expect(text).not.toContain("TOP-SECRET");
    });

    it("keeps the legacy /health route semantics", async () => {
      const body = await (await fetch(`${dataBase}/health`)).json();
      expect(body.ok).toBe(true);
      expect(body.modelProvider).toBeDefined();
      expect(body.sessions).toBe(0);
    });
  });
});

describe("panel server authentication", () => {
  const PASSWORD = "panel-test-secret";
  const FIXED_NOW = () => new Date(`${TODAY}T05:00:00.000Z`);

  let authRoot: string;
  let authServer: http.Server;
  let authBase: string;

  async function startAuthServer(rootDir: string, password?: string): Promise<http.Server> {
    return startPanelServer({
      port: 0,
      rootDir,
      password,
      fetchLadder: async () => {
        throw new Error("network disabled in tests");
      },
      now: FIXED_NOW,
    });
  }

  function baseOf(server: http.Server): string {
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async function login(base: string, password: string, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ password }),
    });
  }

  function sessionCookie(response: Response): string {
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("serenity_panel_session=");
    return setCookie.split(";")[0]!;
  }

  beforeAll(async () => {
    delete process.env.PANEL_PASSWORD;
    authRoot = await fs.mkdtemp(path.join(os.tmpdir(), "panel-auth-"));
    await fs.mkdir(path.join(authRoot, "panel", "dist"), { recursive: true });
    await fs.writeFile(path.join(authRoot, "panel", "dist", "index.html"), "<!doctype html><title>panel</title>");
    authServer = await startAuthServer(authRoot, PASSWORD);
    authBase = baseOf(authServer);
  });

  afterAll(async () => {
    await new Promise((resolve) => authServer.close(resolve));
    await fs.rm(authRoot, { recursive: true, force: true });
  });

  describe("no password configured (regression: stays fully open)", () => {
    let openRoot: string;
    let openServer: http.Server;
    let openBase: string;

    beforeAll(async () => {
      openRoot = await fs.mkdtemp(path.join(os.tmpdir(), "panel-open-"));
      openServer = await startAuthServer(openRoot, undefined);
      openBase = baseOf(openServer);
    });

    afterAll(async () => {
      await new Promise((resolve) => openServer.close(resolve));
      await fs.rm(openRoot, { recursive: true, force: true });
    });

    it("GET /api/overview stays open without a cookie", async () => {
      const response = await fetch(`${openBase}/api/overview`);
      expect(response.status).toBe(200);
    });

    it("GET /api/auth/status reports required=false, authenticated=true", async () => {
      const response = await fetch(`${openBase}/api/auth/status`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ required: false, authenticated: true });
    });
  });

  describe("with password configured", () => {
    it("returns 401 unauthorized on /api/overview without a cookie", async () => {
      const response = await fetch(`${authBase}/api/overview`);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "unauthorized" });
    });

    it("protects /api/health (data freshness leaks)", async () => {
      const response = await fetch(`${authBase}/api/health`);
      expect(response.status).toBe(401);
    });

    it("returns 401 on POST /chat without a cookie", async () => {
      const response = await fetch(`${authBase}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      });
      expect(response.status).toBe(401);
    });

    it("returns 401 on POST /reset without a cookie", async () => {
      const response = await fetch(`${authBase}/reset`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(401);
    });

    it("keeps the SPA shell open at /", async () => {
      const response = await fetch(`${authBase}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    });

    it("keeps the bare /health open", async () => {
      const response = await fetch(`${authBase}/health`);
      expect(response.status).toBe(200);
      expect((await response.json()).ok).toBe(true);
    });

    it("GET /api/auth/status is open and reports unauthenticated", async () => {
      const response = await fetch(`${authBase}/api/auth/status`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ required: true, authenticated: false });
    });

    it("rejects a wrong password with 401", async () => {
      const response = await login(authBase, "wrong-password");
      expect(response.status).toBe(401);
      expect(response.headers.get("set-cookie")).toBeNull();
    });

    it("rejects a made-up session cookie", async () => {
      const response = await fetch(`${authBase}/api/overview`, {
        headers: { cookie: `serenity_panel_session=${"f".repeat(64)}` },
      });
      expect(response.status).toBe(401);
    });

    it("logs in with the correct password and unlocks /api/overview", async () => {
      const response = await login(authBase, PASSWORD);
      expect(response.status).toBe(200);
      const setCookie = response.headers.get("set-cookie")!;
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      expect(setCookie).toContain("Path=/");
      expect(setCookie).toContain("Max-Age=2592000");
      // CORS 全开 + cookie 是参考项目的原始漏洞：绝不允许带凭据的跨源放行。
      expect(response.headers.get("access-control-allow-credentials")).toBeNull();

      const cookie = sessionCookie(response);
      const overview = await fetch(`${authBase}/api/overview`, { headers: { cookie } });
      expect(overview.status).toBe(200);

      const status = await fetch(`${authBase}/api/auth/status`, { headers: { cookie } });
      expect(await status.json()).toEqual({ required: true, authenticated: true });
    });

    it("stores only the sha256 of the token in runs/panel-sessions.json", async () => {
      const response = await login(authBase, PASSWORD);
      const cookie = sessionCookie(response);
      const token = cookie.split("=")[1]!;
      const raw = await fs.readFile(path.join(authRoot, "runs", "panel-sessions.json"), "utf8");
      expect(raw).not.toContain(token);
    });

    it("invalidates the cookie after logout", async () => {
      const cookie = sessionCookie(await login(authBase, PASSWORD));
      const logout = await fetch(`${authBase}/api/auth/logout`, { method: "POST", headers: { cookie } });
      expect(logout.status).toBe(200);
      expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
      const after = await fetch(`${authBase}/api/overview`, { headers: { cookie } });
      expect(after.status).toBe(401);
    });

    it("keeps old sessions valid across a server restart (persistence)", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "panel-restart-"));
      const first = await startAuthServer(root, PASSWORD);
      const cookie = sessionCookie(await login(baseOf(first), PASSWORD));
      await new Promise((resolve) => first.close(resolve));

      const second = await startAuthServer(root, PASSWORD);
      try {
        const response = await fetch(`${baseOf(second)}/api/overview`, { headers: { cookie } });
        expect(response.status).toBe(200);
      } finally {
        await new Promise((resolve) => second.close(resolve));
        await fs.rm(root, { recursive: true, force: true });
      }
    });
  });

  describe("login rate limiting (by socket address, X-Forwarded-For must not matter)", () => {
    let rateRoot: string;
    let rateServer: http.Server;
    let rateBase: string;

    beforeAll(async () => {
      rateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "panel-rate-"));
      rateServer = await startAuthServer(rateRoot, PASSWORD);
      rateBase = baseOf(rateServer);
    });

    afterAll(async () => {
      await new Promise((resolve) => rateServer.close(resolve));
      await fs.rm(rateRoot, { recursive: true, force: true });
    });

    it("locks after 5 failures and returns 429 even for the correct password", async () => {
      // 每次失败都伪造不同的 X-Forwarded-For：若限速被 XFF 分流（参考项目的坑），
      // 计数就永远到不了 5，下面的 429 断言会失败。
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await login(rateBase, "wrong-password", {
          "x-forwarded-for": `10.0.0.${attempt + 1}`,
        });
        expect(response.status).toBe(401);
      }
      const locked = await login(rateBase, PASSWORD, { "x-forwarded-for": "10.0.0.99" });
      expect(locked.status).toBe(429);
    });
  });
});
