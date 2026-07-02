// Adapted from tickflow-stock-panel (MIT) — 共享 query hooks 去重模式：
// 多页面消费同一数据时共享同一 queryKey 缓存，避免重复 useQuery 声明与重复请求。
//
// 面板是只读镜像：工件文件不常变，默认 staleTime 60s；梯队当日快照 5 分钟。

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import type { FfdReportStatus, GraveyardReason } from "@/lib/types";

const ARTIFACT_STALE_MS = 60_000;
const LADDER_STALE_MS = 300_000;

/** 认证状态 — LoginGate 与 Sidebar 退出按钮共用；开放端点，失败不重试（离线时放行进壳）。 */
export function useAuthStatus() {
  return useQuery({ queryKey: QK.authStatus, queryFn: api.authStatus, retry: false, staleTime: Infinity });
}

/** 服务健康 + 数据新鲜度 — Sidebar 底部专用，全局唯一轮询点（60s）。 */
export function useHealth() {
  return useQuery({
    queryKey: QK.health,
    queryFn: api.health,
    refetchInterval: 60_000,
    // Sidebar 常驻：请求失败（server 未启动）时静默显示离线态，不无限重试刷 toast
    retry: false,
  });
}

/** 总览聚合 — Dashboard 专用。 */
export function useOverview() {
  return useQuery({ queryKey: QK.overview, queryFn: api.overview, staleTime: ARTIFACT_STALE_MS });
}

/** 筛选批次列表 — 报告库 / Dashboard 共用。 */
export function useScreens(limit = 50) {
  return useQuery({
    queryKey: QK.screens(limit),
    queryFn: () => api.screens(limit),
    staleTime: ARTIFACT_STALE_MS,
  });
}

/** 单批次原文 — 报告库详情。 */
export function useScreen(runId: string | undefined) {
  return useQuery({
    queryKey: QK.screen(runId ?? ""),
    queryFn: () => api.screen(runId ?? ""),
    enabled: Boolean(runId),
    staleTime: ARTIFACT_STALE_MS,
  });
}

/** 批次配对 markdown 报告 — 纸面阅读面。 */
export function useScreenReport(runId: string | undefined) {
  return useQuery({
    queryKey: QK.screenReport(runId ?? ""),
    queryFn: () => api.screenReport(runId ?? ""),
    enabled: Boolean(runId),
    staleTime: ARTIFACT_STALE_MS,
  });
}

/** Watchlist — 报告库 / Dashboard / 持仓页共用。 */
export function useWatchlist() {
  return useQuery({ queryKey: QK.watchlist, queryFn: api.watchlist, staleTime: ARTIFACT_STALE_MS });
}

/** 墓地（分页） — 报告库墓地 Tab。 */
export function useGraveyard(params?: { reason?: GraveyardReason; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: QK.graveyard(params?.reason, params?.limit, params?.offset),
    queryFn: () => api.graveyard(params),
    staleTime: ARTIFACT_STALE_MS,
  });
}

/** FFD 研报清单 — 报告库 FFD Tab。 */
export function useFfdReports(status?: FfdReportStatus) {
  return useQuery({
    queryKey: QK.ffdReports(status),
    queryFn: () => api.ffdReports(status),
    staleTime: ARTIFACT_STALE_MS,
  });
}

/** 过程校准快照 — 校准页 / Dashboard 共用。 */
export function useCalibration() {
  return useQuery({ queryKey: QK.calibration, queryFn: api.calibration, staleTime: ARTIFACT_STALE_MS });
}

/** 结果校准（决议） — 校准页。 */
export function useResolutions() {
  return useQuery({ queryKey: QK.resolutions, queryFn: api.resolutions, staleTime: ARTIFACT_STALE_MS });
}

/** 决策日志 — 校准页 DecisionLogStrip。 */
export function useDecisionLog(status?: "pending" | "resolved") {
  return useQuery({
    queryKey: QK.decisionLog(status),
    queryFn: () => api.decisionLog(status),
    staleTime: ARTIFACT_STALE_MS,
  });
}

/** 最新回测 — 回测页。 */
export function useBacktestLatest() {
  return useQuery({
    queryKey: QK.backtestLatest,
    queryFn: api.backtestLatest,
    staleTime: ARTIFACT_STALE_MS,
  });
}

/** 连板梯队快照 — 梯队页；date=YYYYMMDD，缺省今日（服务端 60s 记忆缓存防抖）。 */
export function useLadder(date?: string) {
  return useQuery({
    queryKey: QK.ladder(date),
    queryFn: () => api.ladder(date),
    staleTime: LADDER_STALE_MS,
  });
}

/** 梯队历史统计 — 梯队页 spark / Dashboard 右栏。 */
export function useLadderHistory(days = 20) {
  return useQuery({
    queryKey: QK.ladderHistory(days),
    queryFn: () => api.ladderHistory(days),
    staleTime: LADDER_STALE_MS,
  });
}

/** 持仓交叉视图 — 持仓页。 */
export function usePortfolio() {
  return useQuery({ queryKey: QK.portfolio, queryFn: api.portfolio, staleTime: ARTIFACT_STALE_MS });
}
