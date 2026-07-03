// Adapted from tickflow-stock-panel (MIT) — auto-fill 股票卡矩阵中的单卡版式。
// 差异化：梯队高度着色用琥珀单色阶（tierTone.ts），禁用参考项目的红色热度渐变；
// bull/bear 仅用于 pctChange 价格语义（tokens.css 铁律）。
import { fmtPctPoint, fmtSealTime, fmtYi, priceColorClass, NA } from "@/lib/format";
import { BIAS_TURN_TONE_CLASS, biasTurnRatio, biasTurnTone } from "@/pages/ladder/biasTurnTone";
import { tierAlpha, warningMix } from "@/pages/ladder/tierTone";
import type { LimitUpStock } from "@/lib/types";

interface LimitUpStockCardProps {
  stock: LimitUpStock;
  /** 所属梯队高度（连板数），决定琥珀色阶。 */
  height: number;
}

export function LimitUpStockCard({ stock, height }: LimitUpStockCardProps) {
  const sealText = stock.sealAmount == null ? NA : fmtYi(stock.sealAmount);
  // bias_turn 观察 overlay（P0-6）：null/缺省一律不渲染，绝不用占位符暗示"低拥挤"
  const ratio = stock.biasTurn == null ? null : biasTurnRatio(stock.biasTurn);

  return (
    <div
      className="group/card rounded-card border border-line bg-surface px-2.5 py-2 transition-colors duration-fast ease-smooth hover:border-line-strong hover:bg-raised"
      style={{ borderLeftWidth: 2, borderLeftColor: warningMix(tierAlpha(height)) }}
    >
      {/* 名称 + 涨跌幅（价格语义色） */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-ink" title={stock.name}>
          {stock.name}
        </span>
        <span className={`num shrink-0 text-xs ${priceColorClass(stock.pctChange)}`}>
          {fmtPctPoint(stock.pctChange)}
        </span>
      </div>

      {/* 代码 + 行业 */}
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <span className="num text-2xs text-ink-3">{stock.code}</span>
        <span className="min-w-0 truncate text-2xs text-ink-3" title={stock.industry}>
          {stock.industry || NA}
        </span>
      </div>

      {/* 封单 / 首封 / 炸板次数 */}
      <div className="mt-1.5 flex items-center gap-2 border-t border-line pt-1.5 text-2xs text-ink-3">
        <span title={stock.sealAmount == null ? "封单金额缺失（脏行）" : "封单金额"}>
          封单 <span className="num text-ink-2">{sealText}</span>
        </span>
        {stock.firstSealTime && (
          <span title="首次封板时间">
            首封 <span className="num text-ink-2">{fmtSealTime(stock.firstSealTime)}</span>
          </span>
        )}
        {stock.brokenCount > 0 && (
          <span
            className="num ml-auto shrink-0 rounded-pill bg-warning/[0.14] px-1.5 py-px text-warning"
            title={`当日开板 ${stock.brokenCount} 次`}
          >
            炸{stock.brokenCount}
          </span>
        )}
      </div>

      {/* bias_turn 换手率乖离小标签：拥挤度观察指标，不构成交易信号（页脚有同源声明） */}
      {ratio != null && (
        <div className="mt-1 flex items-center">
          <span
            className={`num rounded-pill px-1.5 py-px text-2xs ${BIAS_TURN_TONE_CLASS[biasTurnTone(ratio)]}`}
            title="bias_turn 换手率乖离：近5日日均换手 ÷ 自身近480交易日日均换手。≥3×/≥5× 为暂定绝对档，待重校准；观察指标，不构成交易信号"
          >
            热度 {ratio.toFixed(1)}× 平时
          </span>
        </div>
      )}
    </div>
  );
}
