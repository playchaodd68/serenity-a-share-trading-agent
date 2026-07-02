// 最低完成标准校验器（muxuuu deep-research-workflow 模式）。
// 对一次筛选运行（ScreenRun）做"是否达到可交付研究"的硬校验：
// 候选数量、信息源数量、热门主题降级槽位、medium/high 候选的 kill criteria。
// 任一规则不达标 → 结果打上 "initial-pass"（初筛）标签，并列出全部缺口。
import type { ScreenRun } from "../types.js";

export interface CompletenessIssue {
  rule: string;
  detail: string;
}

export interface CompletenessResult {
  passed: boolean;
  label: "complete" | "initial-pass";
  issues: CompletenessIssue[];
}

export interface CompletenessThresholds {
  minCandidates: number;
  minSources: number;
  requireDowngradeSlot: boolean;
  requireKillCriteria: boolean;
}

export const DEFAULT_COMPLETENESS_THRESHOLDS: CompletenessThresholds = {
  minCandidates: 3,
  minSources: 5,
  requireDowngradeSlot: true,
  requireKillCriteria: true,
};

// 评估一次筛选运行是否满足最低完成标准。不达标不阻断流程，
// 只降级为"初筛"标签，强制在输出中暴露缺口。
export function evaluateCompleteness(
  run: ScreenRun,
  thresholds: CompletenessThresholds = DEFAULT_COMPLETENESS_THRESHOLDS,
): CompletenessResult {
  const issues: CompletenessIssue[] = [];

  if (run.candidates.length < thresholds.minCandidates) {
    issues.push({
      rule: "min-candidates",
      detail: `候选数量不足：当前 ${run.candidates.length} 个，最低要求 ${thresholds.minCandidates} 个。`,
    });
  }

  if (run.sourceCount < thresholds.minSources) {
    issues.push({
      rule: "min-sources",
      detail: `信息源数量不足：当前 ${run.sourceCount} 个，最低要求 ${thresholds.minSources} 个。`,
    });
  }

  if (thresholds.requireDowngradeSlot) {
    const downgrades = run.hotThemeDowngrades ?? [];
    if (downgrades.length === 0) {
      issues.push({
        rule: "downgrade-slot",
        detail: "缺少热门主题降级槽位：每次筛选必须给出主题热度排序及被主动降级的方向（或说明为何无需降级）。",
      });
    }
  }

  if (thresholds.requireKillCriteria) {
    const missing = run.candidates.filter(
      (candidate) =>
        (candidate.confidence === "medium" || candidate.confidence === "high") &&
        (candidate.trace.killCriteria ?? []).length === 0,
    );
    for (const candidate of missing) {
      issues.push({
        rule: "kill-criteria",
        detail: `候选 ${candidate.stock.code} ${candidate.stock.name}（置信度 ${candidate.confidence}）缺少 kill criteria：medium/high 候选必须写明可证伪条件。`,
      });
    }
  }

  const passed = issues.length === 0;
  return {
    passed,
    label: passed ? "complete" : "initial-pass",
    issues,
  };
}

// 渲染为可直接放入报告的中文文本。未达标时必须含"这是初筛"提示，
// 防止半成品研究被当作最终结论消费。
export function renderCompleteness(result: CompletenessResult): string {
  if (result.passed) {
    return "✅ 完成度校验通过：本次筛选达到最低完成标准。";
  }
  const lines: string[] = [
    "⚠️ 完成度校验未通过 —— 这是初筛结果，不构成最终研究结论。",
    "缺口清单：",
  ];
  for (const issue of result.issues) {
    lines.push(`- [${issue.rule}] ${issue.detail}`);
  }
  lines.push("请补齐上述缺口后重新校验，方可升级为完整研究。");
  return lines.join("\n");
}
