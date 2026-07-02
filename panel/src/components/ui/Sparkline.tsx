// 轻量 SVG 折线 spark：不依赖 ECharts，用 currentColor 取色（外层用 text-* 控制），
// 供表格行内 / 侧栏迷你趋势使用。空数据渲染占位横线。
import { useId } from "react";
import { cn } from "@/lib/cn";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** 是否填充淡色面积。 */
  fill?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function Sparkline({
  values,
  width = 96,
  height = 24,
  fill = false,
  className,
  "aria-label": ariaLabel,
}: SparklineProps) {
  const gradientId = useId();
  const pad = 2;

  if (values.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={cn("text-ink-3", className)}
        role="img"
        aria-label={ariaLabel ?? "暂无趋势数据"}
      >
        <line x1={pad} y1={height / 2} x2={width - pad} y2={height / 2} stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (width - pad * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const polyline = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${polyline} ${(width - pad).toFixed(1)},${(height - pad).toFixed(1)} ${pad},${(height - pad).toFixed(1)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
