// bias_turn 换手率乖离展示档（提案 §2e / P0-6）：定义 = 近5日日均换手 / 自身近480日日均换手 − 1。
// 提案原型是"分位 >80% 亮红"，但分位数需要全市场截面，单机面板算不了——先用绝对倍数档降级：
// 热度 ≥3× 平时亮 warning 琥珀、≥5× 亮 danger 红。阈值为暂定绝对档，待自有数据积累后重校准。
// 观察 overlay 铁律：只做展示着色，绝不参与任何评分/排序。

/** 热度倍数 ≥3× → warning 琥珀（暂定绝对档，待自有数据重校准）。 */
export const BIAS_TURN_WARN_RATIO = 3;
/** 热度倍数 ≥5× → danger 红（暂定绝对档，待自有数据重校准）。 */
export const BIAS_TURN_DANGER_RATIO = 5;

export type BiasTurnTone = "neutral" | "warning" | "danger";

/** biasTurn 是乖离（比值 − 1）；展示用"当前热度是平时的 X 倍"，即比值本身。 */
export function biasTurnRatio(biasTurn: number): number {
  return biasTurn + 1;
}

export function biasTurnTone(ratio: number): BiasTurnTone {
  if (ratio >= BIAS_TURN_DANGER_RATIO) return "danger";
  if (ratio >= BIAS_TURN_WARN_RATIO) return "warning";
  return "neutral";
}

/** tone → 小标签配色类（danger 为 UI 状态红，与 bull/bear 价格语义无关，tokens.css 已区分）。 */
export const BIAS_TURN_TONE_CLASS: Record<BiasTurnTone, string> = {
  neutral: "bg-raised text-ink-2",
  warning: "bg-warning/[0.14] text-warning",
  danger: "bg-danger/[0.14] text-danger",
};
