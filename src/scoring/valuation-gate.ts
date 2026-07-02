// 估值红黄绿灯硬门（ai-berkshire 模式）。
// 阈值是待校准的先验：PE 分档只提供确定性的纪律约束，
// 不做任何叙事加分——估值是硬门槛，不可被叙事或瓶颈纯正度覆盖。
export type ValuationLight = "red" | "yellow" | "green" | "unknown";

export interface ValuationGateResult {
  light: ValuationLight;
  reasons: string[];
  maxBucket: "core" | "watchlist" | "observe";
}

// 分档阈值（待校准先验）：
// pe == null → unknown；pe < 0 → red；pe >= RED_PE → red；
// YELLOW_PE <= pe < RED_PE → 预期差 >= MIN_GAP_FOR_YELLOW 时 yellow，否则 red；
// 0 < pe < YELLOW_PE → green。
const YELLOW_PE = 80;
const RED_PE = 160;
const MIN_GAP_FOR_YELLOW = 6;

const DISCIPLINE = "估值是硬门槛,不可被叙事或瓶颈纯正度覆盖";

export interface ValuationGateInput {
  pe: number | null;
  expectationGapScore: number;
}

// 纯确定性估值硬门：输入 PE 与预期差评分，输出红黄绿灯与仓位桶上限。
export function evaluateValuationGate(input: ValuationGateInput): ValuationGateResult {
  const { pe, expectationGapScore } = input;

  if (pe === null) {
    return {
      light: "unknown",
      reasons: [
        "估值数据缺失：无法取得 PE，估值灯为 unknown。",
        "缺数据时仓位桶上限为 watchlist，补齐估值数据后再评估。",
      ],
      maxBucket: "watchlist",
    };
  }

  if (pe < 0) {
    return {
      light: "red",
      reasons: [
        `PE 为负（${pe}）：亏损或盈利异常，估值灯为红。`,
        DISCIPLINE,
      ],
      maxBucket: "observe",
    };
  }

  if (pe >= RED_PE) {
    return {
      light: "red",
      reasons: [
        `PE=${pe} 达到或超过红线 ${RED_PE} 倍：估值灯为红。`,
        DISCIPLINE,
      ],
      maxBucket: "observe",
    };
  }

  if (pe >= YELLOW_PE) {
    if (expectationGapScore >= MIN_GAP_FOR_YELLOW) {
      return {
        light: "yellow",
        reasons: [
          `PE=${pe} 处于黄区 [${YELLOW_PE}, ${RED_PE})，但预期差评分 ${expectationGapScore} >= ${MIN_GAP_FOR_YELLOW}，允许降级观察。`,
          DISCIPLINE,
        ],
        maxBucket: "watchlist",
      };
    }
    return {
      light: "red",
      reasons: [
        `PE=${pe} 处于黄区 [${YELLOW_PE}, ${RED_PE})，且预期差评分 ${expectationGapScore} < ${MIN_GAP_FOR_YELLOW}，不足以支撑高估值：估值灯为红。`,
        DISCIPLINE,
      ],
      maxBucket: "observe",
    };
  }

  return {
    light: "green",
    reasons: [`PE=${pe} 低于 ${YELLOW_PE} 倍：估值灯为绿，允许进入核心桶。`],
    maxBucket: "core",
  };
}
