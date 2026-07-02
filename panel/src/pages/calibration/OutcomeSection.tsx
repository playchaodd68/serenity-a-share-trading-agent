// 结果校准区（蓝图 §2.5）：brier/ece display 数字、校准曲线 + 45° 参考线、
// byConfidenceTier / byEvidenceTier 分层表、CandidateResolution 明细表。
// 完整空态：决议在 horizonDays 到期后由 resolutions-update 生成。
import { Hourglass, Table2, Target } from "lucide-react";
import { CalibrationCurve } from "@/components/charts/CalibrationCurve";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatDisplay } from "@/components/ui/StatDisplay";
import { fmtDate, fmtNum, fmtPct, priceColorClass, NA } from "@/lib/format";
import type {
  CandidateResolution,
  ConfidenceLevel,
  ResolutionTierStat,
  ResolutionsResponse,
} from "@/lib/types";

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { low: "低", medium: "中", high: "高" };

const OUTCOME_BADGE: Record<CandidateResolution["outcomeLabel"], { label: string; variant: BadgeVariant }> = {
  validated: { label: "验证", variant: "solid" },
  falsified: { label: "证伪", variant: "danger" },
  inconclusive: { label: "不确定", variant: "muted" },
};

interface OutcomeSectionProps {
  data: ResolutionsResponse;
}

function tierColumns<T extends string>(
  tierLabel: (tier: T) => string,
): Array<DataTableColumn<ResolutionTierStat<T>>> {
  return [
    { key: "tier", header: "层级", render: (row) => <span className="font-medium text-ink">{tierLabel(row.tier)}</span> },
    { key: "count", header: "样本", className: "num text-right", render: (row) => row.count },
    {
      key: "meanPosterior",
      header: "平均后验",
      className: "num text-right",
      render: (row) => fmtNum(row.meanPosterior, 1),
    },
    {
      key: "empiricalHitRate",
      header: "实证命中率",
      className: "num text-right",
      render: (row) => fmtPct(row.empiricalHitRate, 1, false),
    },
    { key: "brier", header: "Brier", className: "num text-right", render: (row) => fmtNum(row.brier, 4) },
  ];
}

const resolutionColumns: Array<DataTableColumn<CandidateResolution>> = [
  {
    key: "stock",
    header: "代码 / 名称",
    render: (row) => (
      <span className="text-ink">
        <span className="num">{row.code}</span>
        <span className="ml-1.5 text-ink-2">{row.name}</span>
      </span>
    ),
  },
  {
    key: "evidenceTier",
    header: "证据层",
    render: (row) => (
      <Badge variant={row.evidenceTier === "P0-anchored" ? "accent" : "warning"}>{row.evidenceTier}</Badge>
    ),
  },
  {
    key: "confidence",
    header: "置信",
    render: (row) => CONFIDENCE_LABEL[row.confidence] ?? row.confidence,
  },
  {
    key: "probability",
    header: "预测概率",
    className: "num text-right",
    render: (row) => fmtPct(row.probability, 1, false),
  },
  { key: "entryDate", header: "入场日", className: "num", render: (row) => fmtDate(row.entryDate) },
  {
    key: "horizonDays",
    header: "期限",
    className: "num text-right",
    render: (row) => `${row.horizonDays}天`,
  },
  {
    key: "realizedAlpha",
    header: "实现 Alpha",
    className: "num text-right",
    render: (row) => <span className={priceColorClass(row.realizedAlpha)}>{fmtPct(row.realizedAlpha)}</span>,
  },
  {
    key: "outcome",
    header: "结局",
    render: (row) => {
      const conf = OUTCOME_BADGE[row.outcomeLabel] ?? { label: row.outcomeLabel, variant: "outline" as BadgeVariant };
      return <Badge variant={conf.variant}>{conf.label}</Badge>;
    },
  },
  { key: "brier", header: "Brier", className: "num text-right", render: (row) => fmtNum(row.brier, 4) },
  { key: "resolvedAt", header: "决议日", className: "num", render: (row) => fmtDate(row.resolvedAt) },
];

export function OutcomeSection({ data }: OutcomeSectionProps) {
  const calibration = data.calibration;

  if (!calibration) {
    return (
      <EmptyState
        icon={Hourglass}
        title="尚无已到期决议"
        hint={
          <>
            决议在 horizonDays 到期后由 resolutions-update（
            <code className="num text-xs">npm run resolutions:update</code>）生成；生成前结果校准区保持空态 ——
            这不是错误，是预测还没到"对答案"的时间。
          </>
        }
      />
    );
  }

  const overconfident = calibration.overconfidenceGap > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-line pb-5 sm:grid-cols-4">
        <StatDisplay
          label="Brier 均值"
          value={fmtNum(calibration.brierMean, 4)}
          sub={<>{calibration.resolved} 个已决议 · 越低越好</>}
        />
        <StatDisplay label="对数得分均值" value={fmtNum(calibration.logScoreMean, 4)} sub="越低越好" />
        <StatDisplay label="ECE 期望校准误差" value={fmtPct(calibration.ece, 1, false)} sub="分箱置信与命中率的加权偏差" />
        <StatDisplay
          label="过度自信缺口"
          value={fmtPct(calibration.overconfidenceGap, 1)}
          tone={overconfident ? "warning" : "default"}
          sub={overconfident ? "为正 = 平均预测概率高于实际命中率" : "为负 = 整体偏保守"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <section className="rounded-card border border-line bg-surface p-4">
          <SectionTitle
            icon={Target}
            title="校准曲线"
            hint={<>{calibration.reliabilityBins.length} 个分箱 · 虚线为完美校准</>}
          />
          {calibration.reliabilityBins.length > 0 ? (
            <CalibrationCurve bins={calibration.reliabilityBins} />
          ) : (
            <p className="py-10 text-center text-xs text-ink-3">决议样本不足，暂无可靠性分箱。</p>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-card border border-line bg-surface p-4">
            <SectionTitle title="按置信分层" />
            <DataTable
              columns={tierColumns<ConfidenceLevel>((tier) => CONFIDENCE_LABEL[tier] ?? tier)}
              rows={calibration.byConfidenceTier}
              rowKey={(row) => row.tier}
              empty={<p className="py-4 text-center text-xs text-ink-3">{NA}</p>}
            />
          </section>
          <section className="rounded-card border border-line bg-surface p-4">
            <SectionTitle title="按证据分层（P0 锚定 vs P0 封顶）" />
            <DataTable
              columns={tierColumns<CandidateResolution["evidenceTier"]>((tier) => tier)}
              rows={calibration.byEvidenceTier}
              rowKey={(row) => row.tier}
              empty={<p className="py-4 text-center text-xs text-ink-3">{NA}</p>}
            />
          </section>
        </div>
      </div>

      <section className="rounded-card border border-line bg-surface p-4">
        <SectionTitle icon={Table2} title="决议明细" hint={<>{data.resolutions.length} 条</>} />
        <DataTable
          columns={resolutionColumns}
          rows={data.resolutions}
          rowKey={(row) => `${row.code}-${row.entryDate}-${row.resolvedAt}`}
          empty={
            <EmptyState
              icon={Hourglass}
              title="无决议明细"
              hint="calibration 汇总存在但明细为空 —— 检查 runs/resolutions.json。"
              className="min-h-[8rem] py-8"
            />
          }
        />
      </section>
    </div>
  );
}
