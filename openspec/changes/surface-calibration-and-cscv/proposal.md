## Why

Two follow-ups on the merged methodology work:

1. **The overfitting story stopped at single-series Deflated Sharpe.** The doc §5 gate is a multiple-testing risk across a whole config search, which the single-series guard cannot see. CSCV/PBO estimates the direct probability that the in-sample-best configuration is overfit.
2. **The calibration and graveyard machinery was computed but not viewable.** `runs/resolutions.json` had no CLI/Feishu surface, and the graveyard (written by the screen pipeline) had no command to inspect it or its survivorship-inflation base rate.

## What Changes

- **CSCV / PBO** (`src/quant/overfitting.ts`): `cscvPbo(matrix, options)` runs Combinatorially-Symmetric Cross-Validation over a config-search matrix (each configuration's per-period performance) and returns the Probability of Backtest Overfitting, the logit distribution, probability of OOS loss, and in-sample→out-of-sample performance degradation, plus a renderer.
- **Surface calibration & graveyard**: new `resolutions` and `graveyard` CLI commands (+ `npm run` scripts) and Feishu `/resolutions` / `/graveyard`, both empty-safe. `graveyard` also prints survivors-only vs combined hit rate so survivorship inflation is visible.

## Non-goals

- No live FFD price provider (resolutions stay empty until the FFD seam is wired). No auto-wiring of `cscvPbo` into a single `runQuantBacktest` (CSCV needs the whole config-search matrix, which is the caller's responsibility).

## Capabilities

### New Capabilities
- `cscv-pbo`: probability-of-backtest-overfitting estimation over a config-search matrix.
- `calibration-graveyard-surface`: CLI + Feishu commands surfacing the resolution calibration and graveyard.

## Impact

- Affected code: `src/quant/overfitting.ts`, `src/cli.ts`, `package.json`, `README.md`, tests.
- No new runtime dependency. Verified: typecheck + 111 unit tests + deterministic harness green.
