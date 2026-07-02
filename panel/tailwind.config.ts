// Adapted from tickflow-stock-panel (MIT) — 语义色 token 映射 + 分层圆角 + smooth 缓动。
// 单一事实来源是 src/styles/tokens.css：这里只做 CSS 变量到 Tailwind 主题的映射，不定义任何色值。
import type { Config } from "tailwindcss";

// CSS 相对色语法 + <alpha-value>：让 bg-accent/15、border-line/60 等透明度修饰符类
// 能从 oklch token 正确派生 alpha 通道（纯 var() 字符串会被 Tailwind 静默丢弃）。
const withAlpha = (token: string) => `rgb(from var(${token}) r g b / <alpha-value>)`;

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: withAlpha("--color-base"),
        surface: withAlpha("--color-surface"),
        raised: withAlpha("--color-raised"),
        overlay: withAlpha("--color-overlay"),
        paper: withAlpha("--color-paper"),
        "paper-ink": withAlpha("--color-paper-ink"),
        line: withAlpha("--color-line"),
        "line-strong": withAlpha("--color-line-strong"),
        ink: withAlpha("--color-ink"),
        "ink-2": withAlpha("--color-ink-2"),
        "ink-3": withAlpha("--color-ink-3"),
        accent: withAlpha("--color-accent"),
        // A 股语义色：仅用于价格 / 收益，不用于 UI 状态
        bull: withAlpha("--color-bull"),
        bear: withAlpha("--color-bear"),
        warning: withAlpha("--color-warning"),
        danger: withAlpha("--color-danger"),
        violet: withAlpha("--color-violet"),
        "chart-bull": withAlpha("--chart-bull"),
        "chart-bear": withAlpha("--chart-bear"),
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        reading: ["var(--font-reading)"],
      },
      fontSize: {
        "2xs": "var(--text-2xs)",
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        read: "var(--text-read)",
        lg: "var(--text-lg)",
        xl: "var(--text-xl)",
        display: "var(--text-display)",
      },
      spacing: {
        "space-1": "var(--space-1)",
        "space-2": "var(--space-2)",
        "space-3": "var(--space-3)",
        "space-4": "var(--space-4)",
        "space-5": "var(--space-5)",
        "space-6": "var(--space-6)",
        "space-8": "var(--space-8)",
        section: "var(--space-section)",
      },
      borderRadius: {
        input: "var(--radius-input)",
        btn: "var(--radius-btn)",
        card: "var(--radius-card)",
        dialog: "var(--radius-dialog)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
      },
      transitionTimingFunction: {
        smooth: "var(--ease-smooth)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "250ms",
        slow: "400ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
