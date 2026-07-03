// 墓地语义分级（2026-07-03 持仓误判复盘）：
// - 主动否决类（kill-triggered / downgraded / manual-reject）→ 红色警告，是"读过并否决"；
// - 中性类（evidence-gap = 系统当时没读过材料；below-entry-bar = 读过但分数未达线）
//   → 灰/中性档案，不许渲染成否决警告——无知不等于否决。
import type { GraveyardReason } from "@/lib/types";

export const ACTIVE_REJECT_REASONS: readonly GraveyardReason[] = [
  "kill-triggered",
  "downgraded",
  "manual-reject",
] as const;

export function isActiveReject(reason: GraveyardReason): boolean {
  return (ACTIVE_REJECT_REASONS as readonly string[]).includes(reason);
}
