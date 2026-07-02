// 纸面阅读面（蓝图 §1.1 决策）：暗色工作台中的独立亮底阅读 surface —
// typography.css 的 .reading-pane 样式 + react-markdown 渲染，serif 可选。
import { useState } from "react";
import { BookOpen, FileWarning, Type } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

interface ReadingPaneProps {
  markdown: string | undefined;
  loading?: boolean;
  /** 报告原文缺失或加载失败（api 层已 toast，此处渲染局部空态）。 */
  error?: boolean;
  /** 头部标题（等宽小字，如 runId）。 */
  title?: string;
  className?: string;
}

export function ReadingPane({ markdown, loading = false, error = false, title, className }: ReadingPaneProps) {
  const [serif, setSerif] = useState(false);

  return (
    <section aria-label="报告原文" className={cn("min-w-0", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <BookOpen className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />
          报告原文
          {title && <span className="num truncate text-2xs font-normal text-ink-3">{title}</span>}
        </h3>
        <button
          type="button"
          aria-pressed={serif}
          onClick={() => setSerif((v) => !v)}
          title={serif ? "切换为黑体阅读" : "切换为衬线阅读"}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-btn border px-2 py-1 text-2xs transition-colors duration-fast ease-smooth",
            serif
              ? "border-accent bg-accent/15 text-accent"
              : "border-line text-ink-3 hover:border-line-strong hover:text-ink-2",
          )}
        >
          <Type className="h-3 w-3" aria-hidden />
          衬线
        </button>
      </div>

      {loading ? (
        <div className="reading-pane" role="status" aria-label="报告加载中">
          <div className="space-y-3 py-4" aria-hidden>
            <div className="h-4 w-3/5 rounded-input bg-paper-ink opacity-10" />
            <div className="h-3 w-full rounded-input bg-paper-ink opacity-10" />
            <div className="h-3 w-11/12 rounded-input bg-paper-ink opacity-10" />
            <div className="h-3 w-4/5 rounded-input bg-paper-ink opacity-10" />
            <div className="h-3 w-full rounded-input bg-paper-ink opacity-10" />
            <div className="h-3 w-2/3 rounded-input bg-paper-ink opacity-10" />
          </div>
        </div>
      ) : error || !markdown ? (
        <div className="grid min-h-[12rem] place-items-center rounded-card border border-line bg-surface px-6 py-10 text-center">
          <div>
            <FileWarning className="mx-auto h-8 w-8 text-ink-3" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 text-sm text-ink-2">报告原文缺失</p>
            <p className="mt-1 text-2xs text-ink-3">未找到该批次配对的 markdown 报告文件（reports/&lt;runId&gt;.md）。</p>
          </div>
        </div>
      ) : (
        <article className={cn("reading-pane", serif && "reading-serif")}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
      )}
    </section>
  );
}
