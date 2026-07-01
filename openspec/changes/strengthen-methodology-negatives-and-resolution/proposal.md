## Why

A GitHub/X/literature scan of investment methodologies similar to Serenity surfaced two structural gaps in the current agent, both confirmed against the code:

1. **Dead negative-signal config.** Each theme in `DEFAULT_THEMES` defines `negativeSignals` (替代路线/客户自研/价格战/技术路线切换…), but `scoreCandidate`/`assessIndustryLogic` never read them. Negatives only weakly lowered a confidence score via `evidence.ts` `RISK_TERMS`; they never lowered `posteriorScore`. The curated per-theme bear list was inert.
2. **Open Bayesian loop.** `calibration.ts` only buckets generated candidates (scores, confidence, coverage gaps, churn). It never grades a past posterior against what actually happened, so the system cannot detect systematic over/under-confidence or survivorship bias — a risk `METHODOLOGY_NOTE` explicitly names but has no tool to measure.

## What Changes

- Wire per-theme `negativeSignals` into `scoreCandidate` as an active, traceable negative delta that lowers the posterior (not the prior), surfaced as a `negative-signal-penalty` score component, a negative-polarity evidence item, and a risk line.
- Add a realized-outcome resolution + proper-scoring calibration module (`src/research/resolution.ts`): grade a posterior against forward alpha vs the candidate's benchmark with Brier/log scores, reliability bins, ECE, an overconfidence gap, and breakdowns by confidence tier and evidence tier. The market-data source is an injected `PriceReturnProvider` (FFD is a documented integration seam, not wired here) so the core is deterministic and unit-tested.

## Capabilities

### New Capabilities
- `negative-signal-scoring`: per-theme negative signals actively lower candidate posterior with a traceable component.
- `resolution-calibration`: closed realized-outcome loop scoring posteriors with proper scoring rules and calibration diagnostics.

### Modified Capabilities
- None (existing `calibration-evals` snapshot behavior is untouched; resolution is additive).

## Non-goals

- No live FFD price wiring, no CLI/Feishu command, and no position sizing or trade signals. The resolution loop stays research-only.
- No change to prior formation, evidence tiering, or the P0 cross-validation cap.

## Impact

- Affected code: `src/methodology.ts`, `src/types.ts`, new `src/research/resolution.ts`, tests `tests/methodology.test.ts`, `tests/resolution.test.ts`.
- No new runtime dependency (pure-TS Brier/log/ECE).
- Verified: `npm run review` (typecheck + 73 unit tests + deterministic harness) green.
