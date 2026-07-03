// 报告库目录内共用的枚举 → 中文标签 / 徽标档位映射。
// 仅供 pages/library/ 使用；如后续多页需要应上移 lib/（S3 切片不改 lib/）。
import type { BadgeVariant } from "@/components/ui/Badge";
import type {
  CandidateResolution,
  CatalystCategory,
  ConfidenceLevel,
  EvidencePolarity,
  FfdReportStatus,
  GraveyardReason,
  KillCriterionCategory,
  SourceTier,
  WatchlistEvent,
} from "@/lib/types";

// ===== 置信度 =====

export const confidenceLabels: Record<ConfidenceLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

// ===== 墓地 reason（五类，语义分级） =====
// 中性类（evidence-gap=没读过 / below-entry-bar=读过但未达线）→ 灰/中性；
// 主动否决类（kill-triggered/downgraded/manual-reject）→ 一律红色警告（2026-07-03 复盘）。

export const GRAVEYARD_REASONS: readonly GraveyardReason[] = [
  "below-entry-bar",
  "evidence-gap",
  "kill-triggered",
  "downgraded",
  "manual-reject",
] as const;

export const graveyardReasonMeta: Record<GraveyardReason, { label: string; variant: BadgeVariant }> = {
  "below-entry-bar": { label: "未达入场线", variant: "muted" },
  "evidence-gap": { label: "证据覆盖不足", variant: "muted" },
  "kill-triggered": { label: "触发否决", variant: "danger" },
  downgraded: { label: "已降权", variant: "danger" },
  "manual-reject": { label: "人工否决", variant: "danger" },
};

// ===== 决议 outcome =====

export const outcomeMeta: Record<CandidateResolution["outcomeLabel"], { label: string; variant: BadgeVariant }> = {
  validated: { label: "已验证", variant: "solid" },
  falsified: { label: "已证伪", variant: "danger" },
  inconclusive: { label: "无定论", variant: "muted" },
};

// ===== FFD 研报状态（五态） =====

export const FFD_STATUSES: readonly FfdReportStatus[] = [
  "downloaded",
  "staged",
  "accepted",
  "rejected",
  "archived",
] as const;

export const ffdStatusMeta: Record<FfdReportStatus, { label: string; variant: BadgeVariant }> = {
  downloaded: { label: "已下载", variant: "outline" },
  staged: { label: "待审核", variant: "warning" },
  accepted: { label: "已采纳", variant: "accent" },
  rejected: { label: "已拒绝", variant: "danger" },
  archived: { label: "已归档", variant: "muted" },
};

// ===== Watchlist 事件类型 =====

export const eventTypeLabels: Record<WatchlistEvent["type"], string> = {
  created: "创建",
  updated: "更新",
  "status-changed": "状态变更",
  "score-changed": "评分变更",
  "evidence-changed": "证据变更",
  "review-scheduled": "复核排期",
  "kill-triggered": "触发否决",
};

// ===== 否决 / 催化条款类别 =====

export const killCategoryLabels: Record<KillCriterionCategory, string> = {
  "evidence-gap": "证据缺口",
  "expectation-window": "预期窗口",
  "negative-signal": "负面信号",
  "supply-release": "供给释放",
  valuation: "估值",
  "bear-falsifier": "空方证伪",
};

export const catalystCategoryLabels: Record<CatalystCategory, string> = {
  earnings: "业绩",
  capacity: "产能",
  certification: "认证",
  pricing: "定价",
};

// ===== 证据 tier / polarity =====

export const tierVariant: Record<SourceTier, BadgeVariant> = {
  P0: "solid",
  P1: "accent",
  P2: "muted",
};

export const polarityMeta: Record<EvidencePolarity, { label: string; className: string }> = {
  positive: { label: "正向", className: "text-accent" },
  negative: { label: "负向", className: "text-danger" },
  neutral: { label: "中性", className: "text-ink-3" },
};

/** 带符号整数/小数文本（Δ后验等增量展示）。 */
export function signedNum(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}
