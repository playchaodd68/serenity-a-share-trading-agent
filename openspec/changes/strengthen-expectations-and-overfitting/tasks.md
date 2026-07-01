## 1. Reverse-DCF expectations (P1a)

- [x] 1.1 `dcfPresentValue` (explicit-period DCF + Gordon terminal), throws when discountRate <= terminalGrowth.
- [x] 1.2 `impliedGrowthRate` via bisection (monotone PV), clamped to bounds.
- [x] 1.3 `assessExpectationsGap` classifying priced-in / positive-expectation-gap / in-line.

## 2. Backtest-overfitting guard (P1b)

- [x] 2.1 `normalCdf` / `normalPpf` helpers.
- [x] 2.2 `probabilisticSharpe` + `expectedMaxSharpe` + `deflatedSharpe` (Bailey / López de Prado).
- [x] 2.3 `purgedKFoldIndices` (contiguous test blocks + purge/embargo).
- [x] 2.4 `assessBacktestOverfitting`; wire optional `overfitting` field into runQuantBacktest (opt-in via options.trials) + report.

## 3. Verification

- [x] 3.1 TDD tests: tests/reverse-dcf.test.ts, tests/overfitting.test.ts, backtest overfitting integration test.
- [x] 3.2 Typecheck + 106 unit tests + deterministic harness green.

## 4. Follow-ups (not in this change)

- [ ] 4.1 Live FFD financials for reverse-DCF (marketCap/FCF/WACC) feeding a P1 evidence item + valuation-discipline factor.
- [ ] 4.2 Full CSCV/PBO (Probability of Backtest Overfitting) combinatorial estimator.
- [ ] 4.3 Use purgedKFoldIndices in a walk-forward factor-weight fit before the §5 gate.
