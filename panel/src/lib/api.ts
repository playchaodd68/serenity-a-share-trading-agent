// Adapted from tickflow-stock-panel (MIT) — 泛型 request<T> + 全局错误 toast 的统一 API 客户端模式。
//
// Dev：Vite 代理 /api 与 /chat 到 :8788（vite.config.ts）
// Prod：同源（src/panel/server.ts 托管 panel/dist）
// 契约：蓝图 §3 全部 15 个只读端点；错误响应形如 { error: string }。

import { toast } from "@/components/ui/Toast";
import type {
  CalibrationSnapshot,
  DecisionLogResponse,
  FfdReportManifest,
  FfdReportStatus,
  GraveyardReason,
  GraveyardResponse,
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

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    return body.error ?? body.message ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const msg = await parseErrorMessage(res);
    toast(msg, "error");
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** markdown 等纯文本响应（/api/screens/:runId/report）。 */
async function requestText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) {
    const msg = await parseErrorMessage(res);
    toast(msg, "error");
    throw new Error(msg);
  }
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

  // 既有 chat-server 端点（S6 Chat 抽屉使用）
  chat: (payload: { sessionId?: string; message: string }) =>
    request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(payload) }),
};
