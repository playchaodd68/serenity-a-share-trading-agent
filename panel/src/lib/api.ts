// Adapted from tickflow-stock-panel (MIT) — 泛型 request<T> + 全局错误 toast 的统一 API 客户端模式。
//
// Dev：Vite 代理 /api 与 /chat 到 :8788（vite.config.ts）
// Prod：同源（src/panel/server.ts 托管 panel/dist）
// 契约：蓝图 §3 全部 15 个只读端点；错误响应形如 { error: string }。

import { toast } from "@/components/ui/Toast";
import type {
  CalibrationSnapshot,
  DecisionLogResponse,
  EvidenceQueue,
  FfdReportManifest,
  FfdReportStatus,
  GraveyardReason,
  GraveyardResponse,
  JobActionName,
  JobRecord,
  LadderHistoryPoint,
  LimitUpLadderSnapshot,
  OverviewResponse,
  PanelHealth,
  PortfolioResponse,
  QuantBacktestResult,
  ResolutionsResponse,
  ScreenRun,
  ScreenRunSummary,
  WatchlistEntry,
} from "@/lib/types";

/** 任意请求收到 401 时派发的全局事件——LoginGate 监听后回到登录门。 */
export const UNAUTHORIZED_EVENT = "serenity:unauthorized";

/** GET /api/auth/status 的响应（开放端点）。 */
export interface AuthStatus {
  required: boolean;
  authenticated: boolean;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

async function failWith(res: Response, silentError = false): Promise<never> {
  const msg = await parseErrorMessage(res);
  if (res.status === 401) {
    // 401 交给 LoginGate 全屏接管，不再叠加错误 toast。
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  } else if (!silentError) {
    toast(msg, "error");
  }
  throw new Error(msg);
}

interface RequestOptions {
  /** true 时失败不弹全局错误 toast（高频轮询端点用，避免刷屏；401 仍派发登录门事件）。 */
  silentError?: boolean;
}

async function request<T>(path: string, init?: RequestInit, opts?: RequestOptions): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) return failWith(res, opts?.silentError);
  return res.json() as Promise<T>;
}

/** markdown 等纯文本响应（/api/screens/:runId/report）。 */
async function requestText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) return failWith(res);
  return res.text();
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

// ===== 动作执行（POST /api/actions/:name → 202 {jobId}；409 = 已有任务运行中） =====

/** POST /api/actions/:name 返回 409 时抛出：携带正在运行的 jobId，供调用方提示/跟踪。 */
export class JobConflictError extends Error {
  readonly runningJobId?: string;

  constructor(message: string, runningJobId?: string) {
    super(message);
    this.name = "JobConflictError";
    this.runningJobId = runningJobId;
  }
}

/**
 * 触发服务端动作。错误不弹全局 toast——由 JobButton/useJobRunner 按 409/400 语义分别提示。
 * 202 → { jobId }；409 → 抛 JobConflictError；其余非 2xx → 抛 Error(服务端 error 文案)。
 */
async function postActionRequest(name: JobActionName, params?: Record<string, unknown>): Promise<{ jobId: string }> {
  const res = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  if (res.ok) return res.json() as Promise<{ jobId: string }>;
  if (res.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new Error("登录状态已失效，请重新登录");
  }
  let body: { error?: string; message?: string; runningJobId?: string } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // 非 JSON 错误体，退回状态行文案
  }
  const msg = body.error ?? body.message ?? `${res.status} ${res.statusText}`;
  if (res.status === 409) throw new JobConflictError(msg, body.runningJobId);
  throw new Error(msg);
}

// ===== Chat（既有 chat-server 语义，S6 使用） =====

export interface ChatToolExecution {
  name: string;
  detail?: string;
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  toolExecutions?: ChatToolExecution[];
}

export const api = {
  // 1. 服务健康 + 数据新鲜度
  health: () => request<PanelHealth>("/api/health"),

  // 2. 总览聚合
  overview: () => request<OverviewResponse>("/api/overview"),

  // 3. 筛选批次列表
  screens: (limit = 50) => request<ScreenRunSummary[]>(`/api/screens${qs({ limit })}`),

  // 4. 单批次原文
  screen: (runId: string) => request<ScreenRun>(`/api/screens/${encodeURIComponent(runId)}`),

  // 5. 批次配对 markdown 报告
  screenReport: (runId: string) => requestText(`/api/screens/${encodeURIComponent(runId)}/report`),

  // 6. Watchlist
  watchlist: () => request<WatchlistEntry[]>("/api/watchlist"),

  // 7. 墓地（分页）
  graveyard: (params?: { reason?: GraveyardReason; limit?: number; offset?: number }) =>
    request<GraveyardResponse>(
      `/api/graveyard${qs({ reason: params?.reason, limit: params?.limit, offset: params?.offset })}`,
    ),

  // 8. 过程校准快照
  calibration: () => request<CalibrationSnapshot | null>("/api/calibration"),

  // 9. 结果校准（决议）
  resolutions: () => request<ResolutionsResponse>("/api/resolutions"),

  // 10. 决策日志
  decisionLog: (status?: "pending" | "resolved") =>
    request<DecisionLogResponse>(`/api/decision-log${qs({ status })}`),

  // 11. 最新回测
  backtestLatest: () => request<QuantBacktestResult | null>("/api/backtest/latest"),

  // 12. 连板梯队快照（date=YYYYMMDD；缺省为今日）
  ladder: (date?: string) => request<LimitUpLadderSnapshot>(`/api/ladder${qs({ date })}`),

  // 13. 梯队历史统计
  ladderHistory: (days = 20) => request<LadderHistoryPoint[]>(`/api/ladder/history${qs({ days })}`),

  // 14. 持仓交叉视图
  portfolio: () => request<PortfolioResponse>("/api/portfolio"),

  // 15. FFD 研报清单
  ffdReports: (status?: FfdReportStatus) =>
    request<FfdReportManifest[]>(`/api/reports/ffd${qs({ status })}`),

  // 16. 证据补齐队列（runs/evidence-queue.json 缺失时为 null）
  evidenceQueue: () => request<EvidenceQueue | null>("/api/evidence-queue"),

  // 17. 触发服务端动作（screen / backtest / reports-* 等，见 JobActionName）
  postAction: postActionRequest,

  // 18. 单任务状态（useJobRunner.watch 1.5s 轮询至终态；轮询端点静默失败）
  getJob: (id: string) => request<JobRecord>(`/api/jobs/${encodeURIComponent(id)}`, undefined, { silentError: true }),

  // 19. 任务列表（降序；useJobRunner 全局忙检测轮询；轮询端点静默失败）
  listJobs: async (limit = 20): Promise<JobRecord[]> => {
    const res = await request<{ jobs: JobRecord[] }>(`/api/jobs${qs({ limit })}`, undefined, { silentError: true });
    return res.jobs;
  },

  // 既有 chat-server 端点（S6 Chat 抽屉使用）
  chat: (payload: { sessionId?: string; message: string }) =>
    request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(payload) }),

  // 认证（三个端点自身开放；见 src/panel/auth.ts）
  authStatus: () => request<AuthStatus>("/api/auth/status"),
  login: (password: string) => request<{ ok: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};
