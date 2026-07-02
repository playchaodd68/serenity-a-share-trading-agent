// ECharts 通用封装：动态 import('echarts')（工程红线：按页分包，首屏不含 echarts）、
// ResizeObserver 自适应、卸载 dispose；主题经 lib/chartTheme.ts 从 CSS 变量运行时派生。
import { useEffect, useRef } from "react";
import type { ECharts, EChartsOption } from "echarts";
import { baseChartOption, readChartTokens } from "@/lib/chartTheme";
import { cn } from "@/lib/cn";

interface EChartProps {
  option: EChartsOption;
  /** 数据加载中显示 loading 遮罩。 */
  loading?: boolean;
  /** 图表就绪回调（拿实例做事件绑定等）。 */
  onReady?: (chart: ECharts) => void;
  className?: string;
  "aria-label"?: string;
}

export function EChart({ option, loading = false, onReady, className, "aria-label": ariaLabel }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const optionRef = useRef(option);
  const onReadyRef = useRef(onReady);
  optionRef.current = option;
  onReadyRef.current = onReady;

  // 初始化：动态加载 echarts、绑定 ResizeObserver、卸载时 dispose。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let observer: ResizeObserver | null = null;

    void import("echarts").then((echarts) => {
      if (disposed || !containerRef.current) return;
      const chart = echarts.init(containerRef.current);
      chartRef.current = chart;
      const tokens = readChartTokens();
      chart.setOption(baseChartOption(tokens) as EChartsOption);
      chart.setOption(optionRef.current);
      onReadyRef.current?.(chart);

      observer = new ResizeObserver(() => {
        chart.resize();
      });
      observer.observe(containerRef.current);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  // option 更新（notMerge=false 保留基础主题）。
  useEffect(() => {
    chartRef.current?.setOption(option);
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (loading) {
      const tokens = readChartTokens();
      chart.showLoading("default", {
        text: "加载中…",
        color: tokens.accent,
        textColor: tokens.ink2,
        maskColor: "transparent",
      });
    } else {
      chart.hideLoading();
    }
  }, [loading]);

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className={cn("h-64 w-full", className)} />;
}
