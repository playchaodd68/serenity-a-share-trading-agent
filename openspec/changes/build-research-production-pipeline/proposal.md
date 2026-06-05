## Why

The agent can screen A-share themes and produce traceable reports, but most outputs remain low-confidence because candidate-level primary evidence, supply-chain relationships, evidence extraction, watchlist lifecycle, monitoring, calibration, and answer-quality gates are still thin. The goal is to move from a thematic screener to a durable research-production pipeline that can gather, structure, monitor, and audit evidence.

## What Changes

- Add structured evidence extraction from registered sources and candidate context.
- Add a supply-chain graph model that records company/product/theme/source relationships and exposes candidate-specific bottleneck paths.
- Add a persistent watchlist lifecycle for candidates, including status, evidence state, coverage gaps, and review cadence.
- Add primary-evidence ingestion contracts for candidate-specific P0 records, with room for live official connectors and deterministic local fixtures.
- Add monitoring/quality gates for Feishu production readiness, stale reports, missing webhooks/tunnels, and answer safety.
- Add calibration/backtest artifacts that track historical screen outcomes and scoring assumptions.

## Capabilities

### New Capabilities
- `candidate-evidence-pipeline`: Extracts and persists candidate-level evidence from sources and reports.
- `supply-chain-graph`: Builds traceable company/product/theme/source relationship graphs for candidates.
- `watchlist-lifecycle`: Maintains candidate research states, review cadence, and evidence transitions.
- `production-monitoring`: Audits scheduled runs, Feishu readiness, stale reports, and quality gates.
- `calibration-evals`: Tracks historical outcomes and deterministic answer-quality/safety evals.

### Modified Capabilities
- None.

## Impact

- Affected code: source models, methodology scoring, report rendering, CLI commands, operations doctor, harness, tests.
- New generated data files under `data/` and `runs/` remain runtime artifacts.
- No order placement or personalized investment advice is introduced.
