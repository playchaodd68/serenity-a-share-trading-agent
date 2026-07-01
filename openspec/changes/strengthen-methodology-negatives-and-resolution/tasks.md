## 1. Negative-signal scoring

- [x] 1.1 Add `assessNegativeSignals(stock, sources, matchedThemes, themes)` scanning the candidate research text for each matched theme's `negativeSignals`.
- [x] 1.2 Add a `negative-signal-penalty` component to `scoreCandidate` that lowers `posteriorScore` (not `priorScore`), with penalty = clamp(hits * 3, 0, 18).
- [x] 1.3 Emit negative-polarity evidence and a risk line when signals fire; keep the high-confidence path unaffected when no signals match.

## 2. Realized-outcome resolution loop

- [x] 2.1 Add pure `brierScore` and `logScore`.
- [x] 2.2 Add `resolveCandidate` with an injected `PriceReturnProvider`, labeling validated/falsified/inconclusive via an alpha deadband and scoring the posterior.
- [x] 2.3 Add `buildResolutionCalibration` (Brier mean, log-score mean, ECE, reliability bins, overconfidence gap, by-confidence-tier, by-evidence-tier) and `renderResolutionCalibration`.
- [x] 2.4 Add `runs/resolutions.json` load/save helpers.

## 3. Verification

- [x] 3.1 TDD tests for negative-signal wiring in `tests/methodology.test.ts`.
- [x] 3.2 TDD tests for scoring rules, resolution labeling, and calibration aggregation in `tests/resolution.test.ts`.
- [x] 3.3 Run typecheck, unit tests, and deterministic harness (all green).

## 4. Follow-ups (not in this change)

- [ ] 4.1 Implement a live FFD `PriceReturnProvider` (`ffd_stock_performance` + `ffd_index_valuation`) behind the injected seam.
- [ ] 4.2 Add a `resolutions` CLI command + Feishu digest for the calibration report.
- [ ] 4.3 Feed the overconfidence gap back into prior calibration; pair with kill-criteria + graveyard (separate change).
