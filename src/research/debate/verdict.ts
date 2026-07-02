import type { Candidate } from "../../types.js";
import type { BearCase } from "./bear-case.js";

// Deterministic judge: merges the bull side (deterministic scorer output) with the bear
// pass into a five-level symmetric rating. Anti-fence-sitting rule ported from
// TradingAgents' Research Manager — reserve "neutral" for genuinely balanced evidence —
// with its forced-target-price clause deliberately removed (anti-calibration).

export type DebateRating = "strong-add" | "add" | "neutral" | "reduce" | "kill";

export interface DebateVerdict {
  rating: DebateRating;
  rationale: string;
  bearVerdict: BearCase["verdict"] | "missing";
}

export const ANTI_FENCE_SITTING_NOTE =
  "反骑墙：neutral 只保留给双方证据真正势均力敌的情形；否则必须基于最强论据做出承诺。不输出目标价或仓位指令。";

function hasHighSeverityRefutation(bear: BearCase): boolean {
  return bear.failureFindings.some((finding) => finding.severity === "high" && finding.confidence >= 0.6);
}

export function synthesizeVerdict(candidate: Pick<Candidate, "score" | "confidence">, bear: BearCase | null): DebateVerdict {
  if (bear == null) {
    return {
      rating: "neutral",
      rationale: "反方研究员 pass 缺失或未通过校验：结论不得升级，保持 neutral 并先补反方审查。",
      bearVerdict: "missing",
    };
  }
  if (bear.verdict === "refuted") {
    const kill = hasHighSeverityRefutation(bear);
    return {
      rating: kill ? "kill" : "reduce",
      rationale: kill
        ? "反方以高严重度、高置信度证据实质推翻正方论点：触发 kill。"
        : "反方推翻正方论点但严重度/置信度未达 kill 线：降级为 reduce，登记 kill criteria 后复核。",
      bearVerdict: bear.verdict,
    };
  }
  if (bear.verdict === "weakened") {
    const rating: DebateRating = candidate.score >= 45 ? "neutral" : "reduce";
    return {
      rating,
      rationale:
        rating === "neutral"
          ? "反方削弱了正方论点但未推翻；正方评分仍达标，保持 neutral 并跟踪反方列出的关键问题。"
          : "反方削弱正方论点且正方评分不达标：reduce。",
      bearVerdict: bear.verdict,
    };
  }
  const rating: DebateRating = candidate.score >= 70 && candidate.confidence === "high" ? "strong-add" : candidate.score >= 45 ? "add" : "neutral";
  return {
    rating,
    rationale:
      rating === "strong-add"
        ? "反方未找到实质破绽且正方证据完整（P0+交叉验证+高分）：strong-add。"
        : rating === "add"
          ? "反方未找到实质破绽，正方评分达标但证据未满：add。"
          : "反方未找到实质破绽，但正方评分不达标：neutral。",
    bearVerdict: bear.verdict,
  };
}

export function renderVerdict(verdict: DebateVerdict): string {
  return [`辩论裁决：**${verdict.rating}**（bear verdict: ${verdict.bearVerdict}）`, verdict.rationale, ANTI_FENCE_SITTING_NOTE].join("\n");
}
