// 助手气泡内的工具执行轨迹折叠列表。
// 状态点色遵循 Toast 约定（UI 状态色，非 bull/bear）：成功=accent，失败=danger，未知=ink-3。
import { useState } from "react";
import { ChevronDown, Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ToolExecutionTrace } from "@/components/chat/chatApi";

const ARGS_PREVIEW_MAX = 96;

function summarizeArgs(args: unknown): string {
  if (args == null) return "";
  try {
    const text = typeof args === "string" ? args : JSON.stringify(args);
    return text.length > ARGS_PREVIEW_MAX ? `${text.slice(0, ARGS_PREVIEW_MAX)}…` : text;
  } catch {
    return "";
  }
}

function statusDotClass(ok: boolean | undefined): string {
  if (ok === true) return "bg-accent";
  if (ok === false) return "bg-danger";
  return "bg-ink-3";
}

export function ToolTraceList({ traces }: { traces: ToolExecutionTrace[] }) {
  const [expanded, setExpanded] = useState(false);
  const failedCount = traces.filter((t) => t.ok === false).length;

  return (
    <div className="overflow-hidden rounded-btn border border-line bg-base/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-2xs text-ink-3 transition-colors duration-fast ease-smooth hover:text-ink-2"
      >
        <Wrench className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
        <span>
          工具调用 <span className="num">{traces.length}</span> 次
        </span>
        {failedCount > 0 && (
          <span className="text-danger">
            （<span className="num">{failedCount}</span> 次失败）
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3 w-3 shrink-0 transition-transform duration-fast ease-smooth",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {expanded && (
        <ul className="divide-y divide-line border-t border-line">
          {traces.map((trace) => {
            const argsPreview = summarizeArgs(trace.args);
            return (
              <li key={trace.toolCallId} className="flex items-start gap-2 px-2.5 py-1.5">
                <span
                  className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-pill", statusDotClass(trace.ok))}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="num text-2xs text-ink-2">{trace.toolName}</div>
                  {argsPreview && (
                    <div className="num truncate text-2xs text-ink-3" title={argsPreview}>
                      {argsPreview}
                    </div>
                  )}
                </div>
                <span className="num ml-auto shrink-0 text-2xs text-ink-3">
                  {trace.ok === true ? "成功" : trace.ok === false ? "失败" : "未知"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
