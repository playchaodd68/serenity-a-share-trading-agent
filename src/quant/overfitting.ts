// Backtest-overfitting guards. The quant strategy doc §5 gates factor sets on
// RankIC>0.03 / ICIR>0.5 / "样本外不崩溃" — exactly the thresholds a multiple-testing
// search inflates. These add a Deflated Sharpe / PSR multiple-testing correction and a
// purged+embargo CV splitter so a factor set only passes after trial-count correction.

const EULER_MASCHERONI = 0.5772156649015329;
const DEFAULT_DSR_THRESHOLD = 0.95;

// --- normal distribution helpers ---

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Acklam's inverse normal CDF (accuracy ~1e-9).
export function normalPpf(p: number): number {
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// --- moments ---

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export interface ReturnMoments {
  n: number;
  mean: number;
  std: number;
  sharpe: number;
  skewness: number;
  kurtosis: number; // non-excess (normal = 3)
}

export function returnMoments(values: number[]): ReturnMoments {
  const n = values.length;
  const mu = mean(values);
  const m2 = mean(values.map((value) => (value - mu) ** 2));
  const std = Math.sqrt(m2);
  const skewness = std > 0 ? mean(values.map((value) => ((value - mu) / std) ** 3)) : 0;
  const kurtosis = std > 0 ? mean(values.map((value) => ((value - mu) / std) ** 4)) : 3;
  return { n, mean: mu, std, sharpe: std > 0 ? mu / std : 0, skewness, kurtosis };
}

// --- probabilistic / deflated Sharpe ---

export function probabilisticSharpe(sharpe: number, benchmarkSharpe: number, n: number, skewness: number, kurtosis: number): number {
  if (n < 2) return 0.5;
  const denominator = Math.sqrt(Math.max(1e-12, 1 - skewness * sharpe + ((kurtosis - 1) / 4) * sharpe * sharpe));
  const z = ((sharpe - benchmarkSharpe) * Math.sqrt(n - 1)) / denominator;
  return normalCdf(z);
}

export interface DeflatedSharpeInput {
  sharpe: number;
  n: number;
  skewness: number;
  kurtosis: number;
  numTrials: number;
  varianceOfTrialSharpe: number;
}

export interface DeflatedSharpeResult {
  sr0: number;
  dsr: number;
}

// Expected maximum Sharpe under the null across numTrials independent trials.
export function expectedMaxSharpe(numTrials: number, varianceOfTrialSharpe: number): number {
  if (numTrials < 2) return 0;
  const sigma = Math.sqrt(Math.max(0, varianceOfTrialSharpe));
  const a = normalPpf(1 - 1 / numTrials);
  const b = normalPpf(1 - 1 / (numTrials * Math.E));
  return sigma * ((1 - EULER_MASCHERONI) * a + EULER_MASCHERONI * b);
}

export function deflatedSharpe(input: DeflatedSharpeInput): DeflatedSharpeResult {
  const sr0 = expectedMaxSharpe(input.numTrials, input.varianceOfTrialSharpe);
  const dsr = probabilisticSharpe(input.sharpe, sr0, input.n, input.skewness, input.kurtosis);
  return { sr0, dsr };
}

// --- purged + embargo cross-validation ---

export interface CvSplit {
  test: number[];
  train: number[];
}

export function purgedKFoldIndices(n: number, folds: number, embargo = 0): CvSplit[] {
  if (folds < 2) throw new Error(`purgedKFoldIndices needs at least 2 folds (got ${folds}).`);
  if (folds > n) throw new Error(`purgedKFoldIndices needs folds (${folds}) <= n (${n}).`);
  if (embargo < 0) throw new Error(`purgedKFoldIndices needs a non-negative embargo (got ${embargo}).`);
  const splits: CvSplit[] = [];
  for (let k = 0; k < folds; k += 1) {
    const start = Math.round((k * n) / folds);
    const end = Math.round(((k + 1) * n) / folds);
    const test: number[] = [];
    for (let i = start; i < end; i += 1) test.push(i);
    const purgeLo = start - embargo;
    const purgeHi = end + embargo;
    const train: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (i >= purgeLo && i < purgeHi) continue;
      train.push(i);
    }
    splits.push({ test, train });
  }
  return splits;
}

// --- top-level guard ---

export interface OverfittingGuard {
  periods: number;
  numTrials: number;
  perPeriodSharpe: number;
  skewness: number;
  kurtosis: number;
  psrPositive: number;
  deflatedSharpe: DeflatedSharpeResult;
  threshold: number;
  passes: boolean;
}

export interface OverfittingOptions {
  varianceOfTrialSharpe?: number;
  threshold?: number;
}

export function assessBacktestOverfitting(netReturns: number[], numTrials: number, options: OverfittingOptions = {}): OverfittingGuard {
  const moments = returnMoments(netReturns);
  const threshold = options.threshold ?? DEFAULT_DSR_THRESHOLD;
  // Under the null the Sharpe estimator variance ≈ 1/(n-1); a conservative PROXY for the
  // spread of trial Sharpes, not the true variance of the actual configurations searched.
  // Callers who know their real trial-Sharpe spread should override via varianceOfTrialSharpe.
  const varianceOfTrialSharpe = options.varianceOfTrialSharpe ?? 1 / Math.max(1, moments.n - 1);
  const psrPositive = probabilisticSharpe(moments.sharpe, 0, moments.n, moments.skewness, moments.kurtosis);
  const dsr = deflatedSharpe({
    sharpe: moments.sharpe,
    n: moments.n,
    skewness: moments.skewness,
    kurtosis: moments.kurtosis,
    numTrials,
    varianceOfTrialSharpe,
  });
  return {
    periods: moments.n,
    numTrials,
    perPeriodSharpe: moments.sharpe,
    skewness: moments.skewness,
    kurtosis: moments.kurtosis,
    psrPositive,
    deflatedSharpe: dsr,
    threshold,
    passes: dsr.dsr >= threshold,
  };
}
