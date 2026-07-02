// Thompson 采样研究方向分配（RD-Agent bandit 模式）。
// 目标：对抗研究主题的自选择偏差——不是"哪个主题最热就研究哪个"，
// 而是按各主题历史验证胜率的 Beta 后验做随机采样，保证冷门臂仍有探索机会。
// 零依赖：自带确定性 RNG（mulberry32），便于测试与复现。

export interface ThemeArmState {
  themeId: string;
  alpha: number; // 成功次数 + 1（Beta 先验 alpha=1）
  beta: number; // 失败次数 + 1（Beta 先验 beta=1）
}

export interface BanditAllocation {
  themeId: string;
  sampledValue: number;
}

// mulberry32 确定性伪随机数生成器：同 seed 产生同序列，输出 [0, 1)。
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 初始化各主题臂：均匀先验 Beta(1, 1)。
export function initialArms(themeIds: string[]): ThemeArmState[] {
  return themeIds.map((themeId) => ({ themeId, alpha: 1, beta: 1 }));
}

// 不可变更新：outcome=1（验证成功）→ alpha+1，否则 beta+1。
// 未知 themeId 时原样返回（仍是新数组，元素不变）。
export function updateArm(
  arms: ThemeArmState[],
  themeId: string,
  outcome: 0 | 1,
): ThemeArmState[] {
  return arms.map((arm) => {
    if (arm.themeId !== themeId) {
      return arm;
    }
    return {
      ...arm,
      alpha: outcome === 1 ? arm.alpha + 1 : arm.alpha,
      beta: outcome === 1 ? arm.beta : arm.beta + 1,
    };
  });
}

// Beta 分布近似采样：两 uniform 幂变换法（Jöhnk 思路的简化版）。
// sample = u^(1/alpha) / (u^(1/alpha) + v^(1/beta))。
// 注意：这是近似实现，不是精确的 Beta 采样（Jöhnk 原法要求拒绝采样条件
// x + y <= 1），但保持了"alpha 越大均值越高、方差随观测收窄"的序关系，
// 对 bandit 排序用途足够。
function sampleBetaApprox(alpha: number, beta: number, rng: () => number): number {
  // 防止 u/v 恰为 0 导致 0^正数 与除零问题。
  const u = Math.max(rng(), Number.EPSILON);
  const v = Math.max(rng(), Number.EPSILON);
  const x = Math.pow(u, 1 / alpha);
  const y = Math.pow(v, 1 / beta);
  return x / (x + y);
}

// 对每个臂做一次 Beta 近似采样，按 sampledValue 降序返回分配顺序。
export function sampleAllocation(
  arms: ThemeArmState[],
  rng: () => number,
): BanditAllocation[] {
  return arms
    .map((arm) => ({
      themeId: arm.themeId,
      sampledValue: sampleBetaApprox(arm.alpha, arm.beta, rng),
    }))
    .sort((a, b) => b.sampledValue - a.sampledValue);
}

// 选出本轮研究方向：Thompson 采样最高者。
// 由于 sampleBetaApprox 的输出严格落在 (0, 1) 开区间内，任何臂都有
// 非零概率采出最大值——探索保底天然成立，全输臂也不会被永久饿死。
export function pickNextTheme(arms: ThemeArmState[], rng: () => number): string {
  if (arms.length === 0) {
    throw new Error("pickNextTheme: 臂列表为空，无法分配研究方向。");
  }
  const allocation = sampleAllocation(arms, rng);
  return allocation[0].themeId;
}
