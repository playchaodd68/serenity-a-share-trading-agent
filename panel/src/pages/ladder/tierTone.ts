// 梯队高度 → 琥珀单色阶（蓝图 §1.1-4：拥挤度是负面信号，禁用红色"强势"热度渐变）。
// 高度越高、情绪越热 → 琥珀越实（方法论上越要求降权）。
//
// 实现说明：静态透明度一律用 Tailwind `/alpha` 修饰符类（如 border-warning/40）；
// 这里的 color-mix 仅服务于按连板高度运行时计算的透明档，无法落成静态工具类。

/** 琥珀 token 的 color-mix 透明档（percent ∈ [0,100]，仅限运行时动态值）。 */
export function warningMix(percent: number): string {
  return `color-mix(in oklab, var(--color-warning) ${percent}%, transparent)`;
}

/** 高度 → 琥珀不透明度（%），单调递增的单色阶。 */
export function tierAlpha(height: number): number {
  if (height >= 6) return 100;
  if (height >= 5) return 85;
  if (height >= 4) return 70;
  if (height >= 3) return 55;
  if (height >= 2) return 38;
  return 20;
}

/** 梯队标签：1 → 首板，n → n板。 */
export function tierLabel(height: number): string {
  return height === 1 ? "首板" : `${height}板`;
}

/** 梯队标签文字色：≥2 板走琥珀阶，首板保持 muted（不渲染热度）。 */
export function tierLabelColor(height: number): string {
  if (height < 2) return "var(--color-ink-3)";
  return warningMix(Math.min(100, tierAlpha(height) + 25));
}
