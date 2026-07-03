// Adapted from tickflow-stock-panel (MIT) — 集中管理所有 React Query key 的注册表模式。
//
// 新增查询只需在此加一行，所有消费方自动引用同一 key。

export const QK = {
  // 全局 / 共享（Layout 底部新鲜度区）
  health: ["health"] as const,

  // 认证状态（LoginGate / Sidebar 退出按钮共用）
  authStatus: ["auth-status"] as const,

  // 总览
  overview: ["overview"] as const,

  // 筛选批次
  screens: (limit?: number) => ["screens", limit ?? 50] as const,
  screen: (runId: string) => ["screen", runId] as const,
  screenReport: (runId: string) => ["screen-report", runId] as const,

  // Watchlist / 墓地 / FFD / 证据补齐队列
  watchlist: ["watchlist"] as const,
  graveyard: (reason?: string, limit?: number, offset?: number) =>
    ["graveyard", reason ?? "all", limit ?? 100, offset ?? 0] as const,
  ffdReports: (status?: string) => ["ffd-reports", status ?? "all"] as const,
  evidenceQueue: ["evidence-queue"] as const,

  // 评估
  calibration: ["calibration"] as const,
  resolutions: ["resolutions"] as const,
  decisionLog: (status?: string) => ["decision-log", status ?? "all"] as const,
  backtestLatest: ["backtest-latest"] as const,

  // 市场
  ladder: (date?: string) => ["ladder", date ?? "today"] as const,
  ladderHistory: (days?: number) => ["ladder-history", days ?? 20] as const,

  // 账户
  portfolio: ["portfolio"] as const,
} as const;
