// 批次候选表：code/name/score/confidence/matchedThemes + trace 展开行。
// 展开行是本表核心（蓝图 §2.3-1），通用 DataTable 不支持 rowspan 展开，故本地实现。
import { ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { fmtNum } from "@/lib/format";
import type { Candidate } from "@/lib/types";
import { confidenceLabels } from "./labels";
import { TraceDetail } from "./TraceDetail";

const COLUMN_COUNT = 5;

export function CandidateTable({ candidates }: { candidates: Candidate[] }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (code: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th scope="col" className="w-8 px-2 py-2" aria-label="展开" />
            <th scope="col" className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-ink-3">
              代码 / 名称
            </th>
            <th scope="col" className="num px-3 py-2 text-right text-2xs font-medium uppercase tracking-wider text-ink-3">
              评分
            </th>
            <th scope="col" className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-ink-3">
              置信度
            </th>
            <th scope="col" className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-ink-3">
              匹配主题
            </th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => {
            const code = candidate.stock.code;
            const isOpen = expanded.has(code);
            return (
              <Fragment key={code}>
                <tr
                  onClick={() => toggle(code)}
                  className={cn(
                    "group cursor-pointer border-b border-line/60 transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised/50",
                    isOpen && "bg-raised/40",
                  )}
                >
                  <td className="relative px-2 py-2">
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-0.5 -translate-x-full bg-accent transition-transform duration-fast ease-smooth group-hover:translate-x-0"
                    />
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={isOpen ? `收起 ${candidate.stock.name} 评分 trace` : `展开 ${candidate.stock.name} 评分 trace`}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(code);
                      }}
                      className="grid h-6 w-6 place-items-center rounded-btn text-ink-3 transition-colors duration-fast ease-smooth hover:bg-raised hover:text-ink"
                    >
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 transition-transform duration-fast ease-smooth", isOpen && "rotate-90")}
                        aria-hidden
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-baseline gap-2 whitespace-nowrap">
                      <span className="num text-xs text-ink-3">{code}</span>
                      <span className="font-medium text-ink">{candidate.stock.name}</span>
                    </div>
                    <div className="mt-0.5 text-2xs text-ink-3">{candidate.stock.industry || "—"}</div>
                  </td>
                  <td className="num px-3 py-2 text-right text-ink">{fmtNum(candidate.score, 1)}</td>
                  <td className="px-3 py-2 text-ink-2">{confidenceLabels[candidate.confidence]}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {candidate.matchedThemes.slice(0, 2).map((theme) => (
                        <Badge key={theme.themeId} variant="outline" title={theme.keywords.join("、")}>
                          {theme.label}
                        </Badge>
                      ))}
                      {candidate.matchedThemes.length > 2 && (
                        <Badge variant="muted" title={candidate.matchedThemes.slice(2).map((t) => t.label).join("；")}>
                          +{candidate.matchedThemes.length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-line/60">
                    <td colSpan={COLUMN_COUNT} className="px-3 pb-4 pt-2">
                      <TraceDetail trace={candidate.trace} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
