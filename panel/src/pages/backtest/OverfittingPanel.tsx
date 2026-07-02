// 过拟合检验（蓝图 §2.4 OverfittingPanel，方法论招牌位）：
// PSR/DSR 仪表 + 试验次数说明 + CSCV PBO display 数字 + logit 直方图 + 判读文案。
import { Gauge, ShieldAlert } from "lucide-react";
import { PboHistogram } from "@/components/charts/PboHistogram";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatDisplay } from "@/components/ui/StatDisplay";
import { cn } from "@/lib/cn";
import { fmtNum, fmtPct } from "@/lib/format";
import type { CscvResult, OverfittingGuard } from "@/lib/types";

const PBO_RED_LINE = 0.5;

interface OverfittingPanelProps {
  overfitting?: OverfittingGuard;
  cscv?: CscvResult;
}

/** 概率仪表：0–100% 填充条 + 阈值刻度线。 */
function ProbabilityMeter({ label, value, threshold }: { label: string; value: number; threshold?: number }) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-ink-2">{label}</span>
        <span className="num text-sm font-medium text-ink">{fmtPct(value, 1, false)}</span>
      </div>
      <div
        className="relative mt-1.5 h-1.5 rounded-pill bg-raised"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-pill bg-accent transition-[width] duration-normal ease-smooth"
          style={{ width: `${pct}%` }}
        />
        {threshold != null && (
          <div
            aria-hidden
            title={`阈值 ${fmtPct(threshold, 0, false)}`}
            className="absolute -inset-y-1 w-px bg-ink-3"
            style={{ left: `${threshold * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className="num mt-0.5 text-sm text-ink">{value}</dd>
    </div>
  );
}

function GuardCard({ guard }: { guard: OverfittingGuard }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <SectionTitle
        icon={Gauge}
        title="PSR / DSR 多重检验校正"
        hint={
          <>
            {guard.numTrials} 次试验 · {guard.periods} 期
          </>
        }
      />
      <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
        <StatDisplay
          label="PSR（SR > 0 概率）"
          value={fmtPct(guard.psrPositive, 1, false)}
          sub="未做试验次数校正"
        />
        <StatDisplay
          label="DSR（校正后）"
          value={fmtPct(guard.deflatedSharpe.dsr, 1, false)}
          tone={guard.passes ? "default" : "danger"}
          sub={
            <>
              阈值 <span className="num">{fmtPct(guard.threshold, 0, false)}</span>
            </>
          }
        />
        <div className="pt-1">
          {guard.passes ? (
            <Badge variant="accent">通过</Badge>
          ) : (
            <Badge variant="danger">未通过</Badge>
          )}
        </div>
      </div>
      <div className="mt-5 grid gap-4 sm:max-w-md">
        <ProbabilityMeter label="PSR" value={guard.psrPositive} />
        <ProbabilityMeter label="DSR（含 SR* 基准线抬升）" value={guard.deflatedSharpe.dsr} threshold={guard.threshold} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-5">
        <DetailItem label="每期夏普" value={fmtNum(guard.perPeriodSharpe, 4)} />
        <DetailItem label="SR*（试验校正基准）" value={fmtNum(guard.deflatedSharpe.sr0, 4)} />
        <DetailItem label="偏度" value={fmtNum(guard.skewness, 3)} />
        <DetailItem label="峰度" value={fmtNum(guard.kurtosis, 3)} />
        <DetailItem label="试验次数" value={guard.numTrials} />
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        判读：DSR 是在 {guard.numTrials} 次参数试验的多重检验校正后、夏普真实为正的概率。低于阈值说明业绩可能来自参数
        选择偏差而非真实预测能力；试验次数越多，SR* 基准线越高，越难蒙混过关。
      </p>
    </section>
  );
}

function CscvCard({ cscv }: { cscv: CscvResult }) {
  const isRedLight = cscv.pbo > PBO_RED_LINE;
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <SectionTitle
        icon={ShieldAlert}
        title="CSCV 组合对称交叉验证"
        hint={
          <>
            {cscv.nConfigs} 配置 × {cscv.nBlocks} 块 · {cscv.nCombinations} 组合
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <div className="space-y-4">
          <StatDisplay
            label="PBO 过拟合概率"
            value={fmtPct(cscv.pbo, 1, false)}
            tone={isRedLight ? "danger" : "default"}
            sub={isRedLight ? <Badge variant="danger">过拟合红灯</Badge> : <Badge variant="outline">低于红灯线</Badge>}
          />
          <p className={cn("text-xs leading-relaxed", isRedLight ? "text-danger" : "text-ink-3")}>
            判读：PBO &gt; {fmtPct(PBO_RED_LINE, 0, false)} 视为过拟合红灯 ——
            样本内最优配置在样本外多数情况下跌到中位数以下。
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-3">
            <DetailItem label="logit 中位数" value={fmtNum(cscv.medianLogit, 3)} />
            <DetailItem label="样本外亏损概率" value={fmtPct(cscv.probabilityOfLoss, 1, false)} />
            <DetailItem label="样本内表现" value={fmtNum(cscv.performanceDegradation.inSample, 4)} />
            <DetailItem label="样本外表现" value={fmtNum(cscv.performanceDegradation.outOfSample, 4)} />
          </dl>
        </div>
        <div>
          <div className="mb-1 text-2xs uppercase tracking-wider text-ink-3">logit 分布（红色分箱 = logit ≤ 0 过拟合侧）</div>
          <PboHistogram logits={cscv.logits} />
        </div>
      </div>
    </section>
  );
}

export function OverfittingPanel({ overfitting, cscv }: OverfittingPanelProps) {
  if (!overfitting && !cscv) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="本次回测未附带过拟合检验"
        hint={
          <>
            带试验计数重跑 <code className="num text-xs">npm run quant:backtest</code>{" "}
            可生成 PSR/DSR 与 CSCV（PBO）工件。
          </>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {overfitting && <GuardCard guard={overfitting} />}
      {cscv ? (
        <CscvCard cscv={cscv} />
      ) : (
        <section className="rounded-card border border-dashed border-line bg-surface/60 p-4 text-xs text-ink-3">
          未运行 CSCV：需要多配置试验数据才能计算 PBO（组合对称交叉验证）。
        </section>
      )}
    </div>
  );
}
