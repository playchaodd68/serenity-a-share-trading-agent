// 动作执行任务 runner（面板从只读镜像 → 可操作工作台的核心 hook）。
//
// 职责：
// 1. runningJob：1.5s 轮询 GET /api/jobs（React Query 按 QK.jobs 去重，多处挂载共享一次轮询），
//    列表中存在 status="running" 即视为全局忙 —— 所有 JobButton 统一禁用，防并发。
// 2. start(name, params)：POST /api/actions/:name，返回 jobId；409 抛 JobConflictError。
// 3. watch(jobId)：1.5s 轮询 GET /api/jobs/:id 至终态，resolve 终态 JobRecord。
// 4. 任务到终态时按动作类型 invalidateQueries（键值以 queryKeys.ts 为准）并 toast 一次。
//
// 终态处理用模块级去重集合：watch() 与列表轮询都可能观察到同一次终态迁移
// （含 StrictMode 双跑、多个组件同时挂载 hook），保证 invalidate + toast 恰好执行一次；
// 且页面切换（组件卸载）后由仍在挂载的任意 hook 实例接力完成刷新。

import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { QK } from "@/lib/queryKeys";
import type { JobActionName, JobRecord } from "@/lib/types";

/** 轮询间隔（全局忙检测与 watch 共用）。 */
export const JOB_POLL_MS = 1500;

/** watch 连续轮询失败上限——超过则放弃（列表轮询仍会兜底完成终态刷新）。 */
const WATCH_MAX_CONSECUTIVE_ERRORS = 3;

// ===== 动作中文名（toast / 进度条共用） =====

const ACTION_LABELS: Record<JobActionName, string> = {
  screen: "全市场筛选",
  backtest: "量化回测",
  "resolutions-update": "决议对账",
  "consensus-archive": "一致预期存档",
  "reports-convert": "研报转换",
  "reports-accept-quality": "质量门批量接受",
  "reports-accept": "接受研报",
  "reports-reject": "拒绝研报",
};

export function jobActionLabel(name: JobActionName): string {
  return ACTION_LABELS[name] ?? name;
}

// ===== 终态 → 按动作类型失效缓存（键值来自 queryKeys.ts；数组前缀匹配参数化 key） =====

function invalidationKeys(name: JobActionName): ReadonlyArray<readonly unknown[]> {
  switch (name) {
    case "backtest":
      return [QK.backtestLatest];
    case "reports-convert":
    case "reports-accept-quality":
    case "reports-accept":
    case "reports-reject":
      // 前缀匹配 QK.ffdReports(status) = ["ffd-reports", status ?? "all"] 的全部状态过滤
      return [["ffd-reports"]];
    case "screen":
      // 前缀匹配 QK.screens(limit) / QK.graveyard(reason, limit, offset)
      return [QK.overview, ["screens"], QK.watchlist, ["graveyard"]];
    case "resolutions-update":
    case "consensus-archive":
      // 前缀匹配 QK.decisionLog(status) = ["decision-log", status ?? "all"]
      return [QK.calibration, QK.resolutions, ["decision-log"]];
  }
}

// ===== 模块级终态去重（跨 hook 实例 / 跨页面导航存活） =====

/** 曾被观察到 running 的任务 id——只有它们的终态迁移才触发刷新与 toast。 */
const seenRunning = new Set<string>();
/** 已完成终态处理（invalidate + toast）的任务 id。 */
const handledTerminal = new Set<string>();

function handleTerminal(queryClient: QueryClient, job: JobRecord): void {
  if (job.status === "running" || handledTerminal.has(job.id)) return;
  handledTerminal.add(job.id);
  seenRunning.delete(job.id);

  for (const key of invalidationKeys(job.name)) {
    void queryClient.invalidateQueries({ queryKey: key });
  }

  const label = jobActionLabel(job.name);
  if (job.status === "succeeded") {
    toast(`${label}完成`, "success");
  } else {
    const exit = job.exitCode !== undefined ? `（退出码 ${job.exitCode}）` : "";
    toast(`${label}失败${exit}`, "error");
  }
}

// ===== watch：轮询单任务至终态（模块级 promise 去重，卸载后仍继续直至终态） =====

const watchPromises = new Map<string, Promise<JobRecord>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function watchJob(queryClient: QueryClient, jobId: string): Promise<JobRecord> {
  const existing = watchPromises.get(jobId);
  if (existing) return existing;

  const promise = (async (): Promise<JobRecord> => {
    try {
      let consecutiveErrors = 0;
      for (;;) {
        try {
          const job = await api.getJob(jobId);
          consecutiveErrors = 0;
          if (job.status !== "running") {
            handleTerminal(queryClient, job);
            return job;
          }
          seenRunning.add(job.id);
        } catch (error) {
          consecutiveErrors += 1;
          if (consecutiveErrors >= WATCH_MAX_CONSECUTIVE_ERRORS) throw error;
        }
        await sleep(JOB_POLL_MS);
      }
    } finally {
      watchPromises.delete(jobId);
    }
  })();

  watchPromises.set(jobId, promise);
  return promise;
}

// ===== hook 本体 =====

export interface JobRunner {
  /** 当前正在运行的任务（含 logTail，可用于进度展示）；undefined = 空闲。 */
  runningJob: JobRecord | undefined;
  /** 存在运行中任务即全局忙——所有 JobButton 据此禁用。 */
  busy: boolean;
  /** 触发动作，返回 jobId；409 抛 JobConflictError，其余错误抛 Error。 */
  start: (name: JobActionName, params?: Record<string, unknown>) => Promise<string>;
  /** 轮询任务至终态并 resolve 终态记录（终态刷新/toast 已在内部完成）。 */
  watch: (jobId: string) => Promise<JobRecord>;
}

export function useJobRunner(): JobRunner {
  const queryClient = useQueryClient();

  const jobsQuery = useQuery({
    queryKey: QK.jobs,
    queryFn: () => api.listJobs(),
    refetchInterval: JOB_POLL_MS,
    // 服务端未升级 / 离线时静默（api.listJobs 已 silentError），不重试刷请求
    retry: false,
    staleTime: 0,
  });

  // 列表轮询观察终态迁移：兜住"任务由别处发起 / 发起按钮已卸载"的刷新与提示
  useEffect(() => {
    const jobs = jobsQuery.data;
    if (!jobs) return;
    for (const job of jobs) {
      if (job.status === "running") {
        seenRunning.add(job.id);
      } else if (seenRunning.has(job.id)) {
        handleTerminal(queryClient, job);
      }
    }
  }, [jobsQuery.data, queryClient]);

  const runningJob = jobsQuery.data?.find((job) => job.status === "running");

  const start = useCallback(
    async (name: JobActionName, params?: Record<string, unknown>): Promise<string> => {
      const { jobId } = await api.postAction(name, params);
      seenRunning.add(jobId);
      // 立即刷新任务列表，让其它页面的 JobButton 尽快进入禁用态
      void queryClient.invalidateQueries({ queryKey: QK.jobs });
      return jobId;
    },
    [queryClient],
  );

  const watch = useCallback((jobId: string) => watchJob(queryClient, jobId), [queryClient]);

  return { runningJob, busy: Boolean(runningJob), start, watch };
}
