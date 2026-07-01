## Why

Two P1 gaps from the methodology scan:

1. **No market-implied-expectations read.** Serenity deliberately starts 从产业结构不是股价出发 and had no mechanism to read what a price already discounts; valuation-discipline was 8pts and qualitative. So when it found a real chokepoint it could not answer "is the gap already fully paid for?" — the 产业正确≠交易正确 / 估值透支 failure the methodology note warns about.
2. **No multiple-testing correction on the quant gate.** `docs/serenity-quant-factor-strategy.md` §5 gates factor sets on RankIC>0.03 / ICIR>0.5 / 样本外不崩溃 — exactly the thresholds a multi-config search inflates — and `backtest.ts` had a single split with no trial-count correction and no purged/embargo CV.

## What Changes

- **Reverse-DCF expectations** (`src/research/reverse-dcf.ts`): a pure reverse-DCF that solves for the growth a market value implies (bisection over a Gordon-terminal DCF) and classifies the gap vs the bottleneck supply-gap thesis growth (priced-in / positive-expectation-gap / in-line). Stays a falsifiable research evidence input, not a buy/sell signal. Live financials are a documented FFD seam.
- **Backtest-overfitting guard** (`src/quant/overfitting.ts`): Probabilistic and Deflated Sharpe ratio (Bailey / López de Prado) with normal CDF/PPF helpers, and a purged+embargo K-fold splitter. Wired into `runQuantBacktest` as an optional `overfitting` field computed when `options.trials>=2`, so a factor set only passes after trial-count correction.

## Non-goals

- No live FFD financials wiring for reverse-DCF (pure module + tests; integration seam documented like resolution.ts). No full CSCV/PBO combinatorial estimator (Deflated Sharpe + purged CV shipped; PBO is a follow-up). No `any` metric-library dependency (alphalens/empyrical stay redundant — backtest already computes Sharpe/Calmar/RankIC).

## Capabilities

### New Capabilities
- `reverse-dcf-expectations`: market-implied growth vs thesis growth as a falsifiable evidence input.
- `backtest-overfitting-guard`: multiple-testing-corrected Deflated Sharpe gate + purged/embargo CV.

### Modified Capabilities
- `quant-backtest`: optional overfitting guard on the result and report.

## Impact

- Affected code: new `src/research/reverse-dcf.ts`, new `src/quant/overfitting.ts`, `src/quant/backtest.ts` (opt-in field), tests.
- No new runtime dependency (pure-TS math). Verified: typecheck + 106 unit tests + deterministic harness green.
