import type { ConfidenceLevel } from "../types.js";

// Deterministic pre-computation of the allowed confidence ceiling. The LLM/scorer can
// only pick within this budget — a hard constraint that narrative strength cannot
// override (ported pattern: ai-hedge-fund compute_allowed_actions).

export interface RatingConstraintInput {
  hasCandidateP0: boolean;
  hasIndependentCorroboration: boolean;
  disqualifierTriggered: boolean;
  reflexivityFlag: boolean;
  // undefined = bear-pass engine not yet wired for this candidate (Stage 2 makes it
  // mandatory for "high"); false = required but not completed.
  bearCaseCompleted?: boolean;
}

export interface RatingConstraint {
  ceiling: ConfidenceLevel;
  reasons: string[];
}

const LEVEL_RANK: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

export function minConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}

export function confidenceFromScore(score: number): ConfidenceLevel {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export function computeRatingConstraint(input: RatingConstraintInput): RatingConstraint {
  let ceiling: ConfidenceLevel = "high";
  const reasons: string[] = [];

  if (input.disqualifierTriggered) {
    ceiling = minConfidence(ceiling, "low");
    reasons.push("一票否决信号触发（立案调查/财务造假/清仓式减持等），置信度封顶 low，不受负分上限约束。");
  }
  if (!input.hasCandidateP0) {
    ceiling = minConfidence(ceiling, "medium");
    reasons.push("缺候选级 P0 证据，置信度封顶 medium。");
  }
  if (!input.hasIndependentCorroboration) {
    ceiling = minConfidence(ceiling, "medium");
    reasons.push("缺独立交叉验证，置信度封顶 medium。");
  }
  if (input.reflexivityFlag) {
    ceiling = minConfidence(ceiling, "medium");
    reasons.push("反身性信号：价格异动仅由 P2/社媒线索伴随，无新增 P0/P1 证据，置信度封顶 medium。");
  }
  if (input.bearCaseCompleted === false) {
    ceiling = minConfidence(ceiling, "medium");
    reasons.push("反方研究员 pass 未完成，禁止 high 置信度。");
  }

  return { ceiling, reasons };
}

export function applyRatingConstraint(base: ConfidenceLevel, constraint: RatingConstraint): ConfidenceLevel {
  return minConfidence(base, constraint.ceiling);
}
