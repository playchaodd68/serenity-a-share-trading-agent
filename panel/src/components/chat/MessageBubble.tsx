// 用户 / 助手消息气泡。
// 助手内容用 react-markdown + remark-gfm 渲染；聊天区保持暗色 surface（.reading-pane
// 纸面样式专属报告长文，聊天短回复不套用），markdown 样式经 components 映射用 token 类内联定义。
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { ToolTraceList } from "@/components/chat/ToolTraceList";
import type { ChatMessage } from "@/components/chat/chatStore";
import type { Components } from "react-markdown";

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-accent underline underline-offset-2"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  h1: ({ children }) => <h3 className="mb-1.5 mt-3 text-sm font-semibold text-ink first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold text-ink first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mb-1 mt-2.5 text-sm font-semibold text-ink first:mt-0">{children}</h5>,
  h4: ({ children }) => <h6 className="mb-1 mt-2.5 text-sm font-medium text-ink first:mt-0">{children}</h6>,
  code: ({ className, children }) => (
    <code className={cn("num rounded-input bg-base/60 px-1 py-0.5 text-xs", className)}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-btn bg-base/60 p-3 text-xs last:mb-0">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-line-strong pl-3 text-ink-2 last:mb-0">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-line px-2 py-1 text-left font-medium text-ink-2">{children}</th>
  ),
  td: ({ children }) => <td className="border border-line px-2 py-1 align-top">{children}</td>,
  hr: () => <hr className="my-3 border-line" />,
};

export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[85%] whitespace-pre-wrap rounded-card rounded-br-input border px-3 py-2 text-sm leading-relaxed text-ink",
            message.failed ? "border-danger/40 bg-danger/10" : "border-accent/20 bg-accent/15",
          )}
        >
          {message.content}
          {message.failed && <div className="mt-1 text-2xs text-danger">发送失败</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] space-y-2 rounded-card rounded-bl-input border border-line bg-surface px-3.5 py-2.5 text-sm text-ink-2">
        {message.toolExecutions && message.toolExecutions.length > 0 && (
          <ToolTraceList traces={message.toolExecutions} />
        )}
        {message.content ? (
          <div className="min-w-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          !message.errorMessage && <div className="text-ink-3">（空回复）</div>
        )}
        {message.errorMessage && message.errorMessage !== message.content && (
          <div className="rounded-btn border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-2xs text-danger">
            模型错误：{message.errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}
