// CalibrationMiniCard — 右栏结果校准迷你卡（蓝图 §2.1）：brierMean / ece 等结果校准指标。
// 数据来自 /api/resolutions（ResolutionCalibration）；决议尚未到期生成时展示
// 「未有已到期决议」空态（蓝图指定文案）。
import { ArrowUpRight, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { fmtNum, fmtRelative } from "@/lib/format";
import { useResolutions } from "@/lib/useSharedQueries";

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-btn bg-raised px-2 py-1.5">
      <div className="text-2xs text-ink-3">{label}</div>
      <div className="num mt-0.5 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

export function CalibrationMiniCard() {
  const resolutions = useResolutions();
  const calibration = resolutions.data?.calibration ?? null;

  return (
    <section aria-label="结果校准" className="rounded-card border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink">
          <Target className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden />
          结果校准
        </h2>
        {calibration && <span className="num text-2xs text-ink-3">{fmtRelative(calibration.generatedAt)}</span>}
      </div>

      {resolutions.isLoading ? (
        <p className="px-3 py-5 text-center text-xs text-ink-3" role="status">
          加载中…
        </p>
      ) : !calibration ? (
        <p className="rounded-card border border-dashed border-line px-3 py-5 text-center text-xs leading-relaxed text-ink-3">
          未有已到期决议 — 决议在 horizonDays 到期后由{" "}
          <span className="num">npm run resolutions:update</span> 生成。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <MetricCell label="Brier 均值" value={fmtNum(calibration.brierMean, 3)} />
          <MetricCell label="ECE" value={fmtNum(calibration.ece, 3)} />
          <MetricCell label="已决议" value={String(calibration.resolved)} />
          <MetricCell label="过度自信差" value={fmtNum(calibration.overconfidenceGap, 3)} />
        </div>
      )}

      <Link
        to="/calibration"
        className="mt-3 inline-flex items-center gap-1 text-xs text-accent transition-colors duration-fast ease-smooth hover:text-ink"
      >
        查看校准
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  );
}
