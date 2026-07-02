// 评分桶统计表（蓝图 §2.4 BucketStatTable）。
import { Layers } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtPct, priceColorClass } from "@/lib/format";
import type { QuantBacktestBucketStat } from "@/lib/types";

const BUCKET_LABEL: Record<QuantBacktestBucketStat["bucket"], string> = {
  core: "核心",
  watchlist: "观察池",
  observe: "跟踪",
  reject: "剔除",
  unclassified: "未分类",
};

interface BucketStatTableProps {
  bucketStats: QuantBacktestBucketStat[];
}

const columns: Array<DataTableColumn<QuantBacktestBucketStat>> = [
  {
    key: "bucket",
    header: "评分桶",
    render: (row) => (
      <span className="font-medium text-ink">
        {BUCKET_LABEL[row.bucket] ?? row.bucket}
        <span className="num ml-1.5 text-2xs text-ink-3">{row.bucket}</span>
      </span>
    ),
  },
  {
    key: "observations",
    header: "观测数",
    className: "num text-right",
    render: (row) => row.observations,
  },
  {
    key: "averageForwardReturn",
    header: "平均前瞻收益",
    className: "num text-right",
    render: (row) => (
      <span className={priceColorClass(row.averageForwardReturn)}>{fmtPct(row.averageForwardReturn)}</span>
    ),
  },
  {
    key: "selectedObservations",
    header: "入选观测数",
    className: "num text-right",
    render: (row) => row.selectedObservations,
  },
  {
    key: "averageSelectedWeight",
    header: "平均入选权重",
    className: "num text-right",
    render: (row) => fmtPct(row.averageSelectedWeight, 1, false),
  },
];

export function BucketStatTable({ bucketStats }: BucketStatTableProps) {
  return (
    <DataTable
      columns={columns}
      rows={bucketStats}
      rowKey={(row) => row.bucket}
      empty={<EmptyState icon={Layers} title="无评分桶统计" hint="回测样本未包含桶分类信息。" className="min-h-[8rem] py-8" />}
    />
  );
}
