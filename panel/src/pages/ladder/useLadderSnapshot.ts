// 梯队快照本地查询 hook：与共享 useLadder 的差异是把「历史日期缓存 miss（404）」
// 当作预期空态返回（notFound），而不是走 lib/api.ts 的全局错误 toast + 重试——
// 蓝图 §2.2 要求历史 miss 渲染「该日无缓存快照」，它不是错误。
// queryKey 独立命名空间（不复用 QK.ladder）：本 hook 缓存的是包了 notFound 的
// LadderSnapshotResult，与共享 useLadder 缓存的裸 Snapshot 形状不同，共 key 会互相污染。
import { useQuery } from "@tanstack/react-query";
import type { LimitUpLadderSnapshot } from "@/lib/types";

const LADDER_STALE_MS = 300_000;

export interface LadderSnapshotResult {
  snapshot: LimitUpLadderSnapshot | null;
  /** 历史日期无落盘缓存（服务端 404）。 */
  notFound: boolean;
}

async function fetchLadderSnapshot(date?: string): Promise<LadderSnapshotResult> {
  const search = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await fetch(`/api/ladder${search}`);
  if (res.status === 404) return { snapshot: null, notFound: true };
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // 非 JSON 错误体，保留状态码文案
    }
    throw new Error(message);
  }
  return { snapshot: (await res.json()) as LimitUpLadderSnapshot, notFound: false };
}

/**
 * @param date "YYYY-MM-DD"；undefined = 今日（服务端现场抓取 + 60s 记忆缓存）。
 */
export function useLadderSnapshot(date?: string) {
  return useQuery({
    queryKey: ["ladder-snapshot", date ?? "today"] as const,
    queryFn: () => fetchLadderSnapshot(date),
    staleTime: LADDER_STALE_MS,
    // 今日抓取失败（数据源不可达）直接进错误空态，不重试轰炸数据源
    retry: false,
  });
}
