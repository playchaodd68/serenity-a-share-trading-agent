// 筛选批次列表：runId / generatedAt / candidateCount / totalStocksScanned / sourceCount，
// 点击行进入批次详情（Library 经 ?run= 切换，不引入子路由）。
import { Layers } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { fmtDateTime } from "@/lib/format";
import type { ScreenRunSummary } from "@/lib/types";
import { useScreens } from "@/lib/useSharedQueries";
import { LoadingBlock } from "./primitives";

const columns: Array<DataTableColumn<ScreenRunSummary>> = [
  {
    key: "runId",
    header: "批次 ID",
    render: (row) => <span className="num text-xs text-ink">{row.runId}</span>,
  },
  {
    key: "generatedAt",
    header: "生成时间",
    render: (row) => <span className="num text-xs">{fmtDateTime(row.generatedAt)}</span>,
  },
  {
    key: "candidateCount",
    header: "候选数",
    className: "num text-right",
    render: (row) => row.candidateCount,
  },
  {
    key: "totalStocksScanned",
    header: "扫描股票",
    className: "num text-right",
    render: (row) => row.totalStocksScanned,
  },
  {
    key: "sourceCount",
    header: "注册来源",
    className: "num text-right",
    render: (row) => row.sourceCount,
  },
];

export function ScreensTab({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const screensQuery = useScreens(50);

  if (screensQuery.isLoading) return <LoadingBlock label="加载筛选批次…" />;

  const runs = screensQuery.data ?? [];

  return (
    <section aria-label="筛选批次列表">
      <SectionTitle icon={Layers} title="筛选批次" hint={runs.length > 0 ? `${runs.length} 个批次` : undefined} />
      <DataTable
        columns={columns}
        rows={runs}
        rowKey={(row) => row.runId}
        onRowClick={(row) => onOpenRun(row.runId)}
        empty={
          <EmptyState
            icon={Layers}
            title="尚无筛选批次"
            hint={
              <>
                运行 <code className="num rounded-input bg-raised px-1.5 py-0.5 text-xs">npm run screen</code>{" "}
                生成首个候选批次，工件会写入 reports/screen-*.json 与配对 markdown 报告。
              </>
            }
          />
        }
      />
    </section>
  );
}
