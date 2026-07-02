// Adapted from tickflow-stock-panel (MIT) — 哑光涨跌色、极弱网格线、透明背景、深色 tooltip
// 的 ECharts 视觉配方；升级点（蓝图 §1.1-6）：主题不再是组件内硬编码常量，而是运行时
// 通过 getComputedStyle 从 tokens.css 的 CSS 变量派生，图表与 UI 共享同一 token。
//
// 用法：EChart 封装（components/charts/EChart.tsx）自动 merge baseChartOption()；
// 页面图表通过 readChartTokens() 取语义色，禁止在图表组件里出现字面量色值。

/** 从 tokens.css 派生的图表语义色。 */
export interface ChartTokens {
  bull: string;
  bear: string;
  grid: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  lineStrong: string;
  accent: string;
  warning: string;
  violet: string;
  raised: string;
  overlay: string;
  /** MA / 多序列线色（灰、蓝、橙、紫），顺序即序列默认取色顺序。 */
  ma: [string, string, string, string];
  fontMono: string;
  fontSans: string;
}

function cssVar(styles: CSSStyleDeclaration, name: string): string {
  return styles.getPropertyValue(name).trim();
}

/** 运行时读取 CSS 变量。必须在 DOM 就绪后调用（组件 effect 内）。 */
export function readChartTokens(): ChartTokens {
  const styles = getComputedStyle(document.documentElement);
  return {
    bull: cssVar(styles, "--chart-bull"),
    bear: cssVar(styles, "--chart-bear"),
    grid: cssVar(styles, "--chart-grid"),
    ink: cssVar(styles, "--color-ink"),
    ink2: cssVar(styles, "--color-ink-2"),
    ink3: cssVar(styles, "--color-ink-3"),
    line: cssVar(styles, "--color-line"),
    lineStrong: cssVar(styles, "--color-line-strong"),
    accent: cssVar(styles, "--color-accent"),
    warning: cssVar(styles, "--color-warning"),
    violet: cssVar(styles, "--color-violet"),
    raised: cssVar(styles, "--color-raised"),
    overlay: cssVar(styles, "--color-overlay"),
    ma: [
      cssVar(styles, "--chart-ma-1"),
      cssVar(styles, "--chart-ma-2"),
      cssVar(styles, "--chart-ma-3"),
      cssVar(styles, "--chart-ma-4"),
    ],
    fontMono: cssVar(styles, "--font-mono"),
    fontSans: cssVar(styles, "--font-sans"),
  };
}

/**
 * 所有图表共享的基础 option（透明背景 + 极弱网格 + 深色 tooltip + 弱化坐标轴）。
 * EChart 封装会将其与页面 option 浅合并（页面 option 优先）。
 * 返回宽松的 Record 以便与任意页面 option merge，类型收窄由页面侧负责。
 */
export function baseChartOption(t: ChartTokens): Record<string, unknown> {
  return {
    backgroundColor: "transparent",
    color: [t.accent, t.warning, t.violet, t.ink3],
    textStyle: { color: t.ink2, fontFamily: t.fontSans, fontSize: 11 },
    grid: { top: 32, right: 16, bottom: 28, left: 48, containLabel: false },
    tooltip: {
      backgroundColor: t.overlay,
      borderColor: t.lineStrong,
      borderWidth: 1,
      textStyle: { color: t.ink, fontSize: 11, fontFamily: t.fontMono },
      extraCssText: "box-shadow: var(--shadow-overlay); border-radius: var(--radius-card);",
    },
    xAxis: {
      axisLine: { lineStyle: { color: t.line } },
      axisTick: { show: false },
      axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono },
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.ink3, fontSize: 10, fontFamily: t.fontMono },
      splitLine: { lineStyle: { color: t.grid } },
    },
    legend: {
      textStyle: { color: t.ink2, fontSize: 11 },
      itemWidth: 12,
      itemHeight: 8,
      icon: "rect",
    },
  };
}
