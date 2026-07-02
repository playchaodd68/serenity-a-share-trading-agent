import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { readJsonFile, writeJsonFile } from "../utils/fs.js";

// 面板单密码会话认证。吸取 tickflow-stock-panel 的三个教训：
// 1. 不做任何基于 IP / X-Forwarded-For 的"内网直连放行"——XFF 是客户端任意填写的
//    请求头，可伪造；限速与鉴权只认 TCP 连接的 socket 地址与会话 cookie。
// 2. 所有受保护路径统一走 requiresAuth + isAuthenticated 一个入口判定，禁止任何
//    路由自行实现鉴权（参考项目的 save 端点正是漏在自行判断上）。
// 3. Cookie SameSite=Lax，且服务端绝不下发 Access-Control-Allow-Credentials，
//    杜绝"CORS 全开 + cookie"组合。

export const SESSION_COOKIE_NAME = "serenity_panel_session";
const SESSION_MAX_AGE_SECONDS = 2_592_000; // 30 天
const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_MS = 5 * 60_000;

interface SessionRecord {
  createdAt: string;
}

/** runs/panel-sessions.json 的持久化形态：key 是 token 的 sha256（绝不存原文）。 */
type PersistedSessions = Record<string, SessionRecord>;

interface RateState {
  failures: number;
  lockedUntil: number;
}

export interface PanelAuthOptions {
  /** 面板密码；空 / 未配置表示不启用认证（面板保持完全开放）。 */
  password?: string;
  /** 会话持久化文件路径（存 token 摘要，权限尽量收紧到 0600）。 */
  sessionsPath: string;
  /** 可注入时钟（测试用）；影响会话过期与限速锁定判断。 */
  now?: () => Date;
}

export interface LoginOutcome {
  status: 200 | 401 | 429;
  /** 成功时返回的原始会话 token（仅此一次出现，服务端只存摘要）。 */
  token?: string;
  error?: string;
}

export interface PanelAuth {
  readonly required: boolean;
  /** 统一鉴权入口：该路径是否要求有效会话。 */
  requiresAuth(pathname: string): boolean;
  isAuthenticated(request: IncomingMessage): boolean;
  login(password: unknown, remoteAddress: string): Promise<LoginOutcome>;
  logout(request: IncomingMessage): Promise<void>;
  sessionCookie(token: string): string;
  clearedSessionCookie(): string;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

// 对两侧 sha256 摘要做 timingSafeEqual：摘要天然等长（timingSafeEqual 要求等长输入），
// 且比较耗时与明文内容无关，避免逐字节短路比较泄漏前缀信息。
function passwordMatches(expected: string, provided: string): boolean {
  return crypto.timingSafeEqual(Buffer.from(sha256(expected), "hex"), Buffer.from(sha256(provided), "hex"));
}

function parseSessionToken(request: IncomingMessage): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    if (part.slice(0, separatorIndex).trim() !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(separatorIndex + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}

export async function createPanelAuth(options: PanelAuthOptions): Promise<PanelAuth> {
  const password = options.password?.trim() ?? "";
  const required = password.length > 0;
  const now = options.now ?? (() => new Date());
  const { sessionsPath } = options;

  // 内存会话表：key 为 token 的 sha256。启动时从磁盘恢复并清理过期项。
  const sessions = new Map<string, SessionRecord>();
  // 登录失败限速表：key 为 request.socket.remoteAddress（绝不读 X-Forwarded-For）。
  const rateByAddress = new Map<string, RateState>();

  function isExpired(record: SessionRecord): boolean {
    const createdAtMs = Date.parse(record.createdAt);
    return !Number.isFinite(createdAtMs) || now().getTime() - createdAtMs > SESSION_TTL_MS;
  }

  if (required) {
    const persisted = await readJsonFile<PersistedSessions>(sessionsPath, {});
    for (const [tokenHash, record] of Object.entries(persisted)) {
      if (record?.createdAt && !isExpired(record)) sessions.set(tokenHash, record);
    }
  }

  async function persist(): Promise<void> {
    await writeJsonFile(sessionsPath, Object.fromEntries(sessions));
    try {
      // 尽量收紧到仅属主可读写；个别文件系统不支持时不致命（文件里也只有摘要）。
      await fs.chmod(sessionsPath, 0o600);
    } catch {
      // best-effort
    }
  }

  function requiresAuth(pathname: string): boolean {
    if (!required) return false;
    if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return false;
    // 保护范围：全部 /api/*（含 /api/health，它泄漏数据新鲜度）+ 写路径 /chat、/reset。
    // 静态资源（SPA 壳）与裸 /health 保持开放。
    return pathname === "/api" || pathname.startsWith("/api/") || pathname === "/chat" || pathname === "/reset";
  }

  function isAuthenticated(request: IncomingMessage): boolean {
    if (!required) return true;
    const token = parseSessionToken(request);
    if (!token) return false;
    const tokenHash = sha256(token);
    const record = sessions.get(tokenHash);
    if (!record) return false;
    if (isExpired(record)) {
      sessions.delete(tokenHash);
      return false;
    }
    return true;
  }

  async function login(input: unknown, remoteAddress: string): Promise<LoginOutcome> {
    // 限速主体是 TCP 连接对端地址：X-Forwarded-For 由客户端任意填写、可伪造，
    // 参考项目正是用 XFF 判定"内网请求"被绕过，这里绝不参与判定。
    const address = remoteAddress || "unknown";
    const nowMs = now().getTime();
    const state = rateByAddress.get(address);
    if (state && state.lockedUntil > nowMs) {
      return { status: 429, error: "登录失败次数过多，该地址已锁定，请 5 分钟后再试。" };
    }
    const ok = typeof input === "string" && input.length > 0 && passwordMatches(password, input);
    if (!ok) {
      // 锁定期刚过则从头计数，否则累加。
      const previousFailures = state && state.lockedUntil > 0 && state.lockedUntil <= nowMs ? 0 : (state?.failures ?? 0);
      const failures = previousFailures + 1;
      rateByAddress.set(address, {
        failures,
        lockedUntil: failures >= LOGIN_FAILURE_LIMIT ? nowMs + LOGIN_LOCK_MS : 0,
      });
      return { status: 401, error: "密码错误。" };
    }
    rateByAddress.delete(address);
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(sha256(token), { createdAt: now().toISOString() });
    await persist();
    return { status: 200, token };
  }

  async function logout(request: IncomingMessage): Promise<void> {
    const token = parseSessionToken(request);
    if (!token) return;
    if (sessions.delete(sha256(token))) await persist();
  }

  function sessionCookie(token: string): string {
    return `${SESSION_COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
  }

  function clearedSessionCookie(): string {
    return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
  }

  return { required, requiresAuth, isAuthenticated, login, logout, sessionCookie, clearedSessionCookie };
}
