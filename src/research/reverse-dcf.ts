// Reverse DCF: read what growth a market price already discounts, so a real chokepoint
// can be checked against "is the gap already fully paid for?" — the 产业正确≠交易正确 /
// 估值透支 failure the methodology note warns about, turned into a falsifiable number.
// This stays a research evidence input, not a buy/sell signal.

export interface ReverseDcfInputs {
  marketValue: number; // market cap (or EV) the growth must justify
  baseCashFlow: number; // trailing FCF or normalized earnings, > 0
  discountRate: number; // WACC, e.g. 0.10
  terminalGrowth: number; // perpetuity growth, must be < discountRate
  explicitYears: number; // explicit forecast horizon, e.g. 10
}

export interface ImpliedGrowthOptions {
  lowerBound?: number;
  upperBound?: number;
  iterations?: number;
}

export type ExpectationsVerdict = "priced-in" | "positive-expectation-gap" | "in-line";

export interface ExpectationsGap {
  impliedGrowth: number;
  thesisGrowth: number;
  gapPct: number;
  verdict: ExpectationsVerdict;
  note: string;
}

const DEFAULT_LOWER = -0.5;
const DEFAULT_UPPER = 1.0;
const DEFAULT_ITERATIONS = 200;
const DEFAULT_BAND = 0.02;

export function dcfPresentValue(
  baseCashFlow: number,
  growth: number,
  discountRate: number,
  terminalGrowth: number,
  explicitYears: number,
): number {
  if (!(discountRate > terminalGrowth)) {
    throw new Error(`Discount rate (${discountRate}) must exceed terminal growth (${terminalGrowth}).`);
  }
  let presentValue = 0;
  let cashFlow = baseCashFlow;
  for (let year = 1; year <= explicitYears; year += 1) {
    cashFlow *= 1 + growth;
    presentValue += cashFlow / (1 + discountRate) ** year;
  }
  const terminalCashFlow = cashFlow * (1 + terminalGrowth);
  const terminalValue = terminalCashFlow / (discountRate - terminalGrowth);
  presentValue += terminalValue / (1 + discountRate) ** explicitYears;
  return presentValue;
}

export function impliedGrowthRate(inputs: ReverseDcfInputs, options: ImpliedGrowthOptions = {}): number {
  if (!(inputs.baseCashFlow > 0)) {
    throw new Error(`Reverse DCF needs a positive base cash flow (got ${inputs.baseCashFlow}).`);
  }
  let lo = options.lowerBound ?? DEFAULT_LOWER;
  let hi = options.upperBound ?? DEFAULT_UPPER;
  if (!(lo < hi)) {
    throw new Error(`impliedGrowthRate needs lowerBound (${lo}) < upperBound (${hi}).`);
  }
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const valueAt = (growth: number): number =>
    dcfPresentValue(inputs.baseCashFlow, growth, inputs.discountRate, inputs.terminalGrowth, inputs.explicitYears);

  // Present value is monotonically increasing in growth; clamp to bounds if the price is
  // outside the reachable range, then bisect.
  if (inputs.marketValue <= valueAt(lo)) return lo;
  if (inputs.marketValue >= valueAt(hi)) return hi;
  for (let step = 0; step < iterations; step += 1) {
    const mid = (lo + hi) / 2;
    if (valueAt(mid) < inputs.marketValue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function assessExpectationsGap(
  impliedGrowth: number,
  thesisGrowth: number,
  band = DEFAULT_BAND,
): ExpectationsGap {
  const gapPct = impliedGrowth - thesisGrowth;
  const verdict: ExpectationsVerdict = gapPct > band ? "priced-in" : gapPct < -band ? "positive-expectation-gap" : "in-line";
  const note =
    verdict === "priced-in"
      ? `市场隐含增速 ${(impliedGrowth * 100).toFixed(1)}% 高于瓶颈缺口推算 ${(thesisGrowth * 100).toFixed(1)}%，预期已透支，需订单/价格/产能新证据才配得上估值。`
      : verdict === "positive-expectation-gap"
        ? `市场隐含增速 ${(impliedGrowth * 100).toFixed(1)}% 低于瓶颈缺口推算 ${(thesisGrowth * 100).toFixed(1)}%，存在正预期差（框架推断，需证据支撑）。`
        : `市场隐含增速与瓶颈缺口推算基本吻合（${(impliedGrowth * 100).toFixed(1)}% vs ${(thesisGrowth * 100).toFixed(1)}%）。`;
  return { impliedGrowth, thesisGrowth, gapPct, verdict, note };
}
