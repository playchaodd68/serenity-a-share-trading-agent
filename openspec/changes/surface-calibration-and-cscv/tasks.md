## 1. CSCV / PBO

- [x] 1.1 `cscvPbo(matrix, {blocks, metric})` — even-block CSCV, logit per combination, PBO = fraction below OOS median.
- [x] 1.2 Report probability of OOS loss, in-sample→OOS degradation, median logit; `renderCscv`.
- [x] 1.3 Validate matrix (>=2 configs, rectangular) and blocks (even, 2..periods).

## 2. Surface calibration & graveyard

- [x] 2.1 `resolutions` CLI command + `/resolutions` Feishu + `npm run resolutions` (empty-safe).
- [x] 2.2 `graveyard` CLI command + `/graveyard` Feishu + `npm run graveyard`, printing survivors-only vs combined hit rate.
- [x] 2.3 README command + Feishu list updated.

## 3. Verification

- [x] 3.1 TDD tests for CSCV (dominant-config PBO=0, in-sample-winner-flips PBO>0, bounds, validation).
- [x] 3.2 Typecheck + 111 unit tests + deterministic harness green; both commands smoke-run empty-safe.

## 4. Follow-ups (not in this change)

- [ ] 4.1 Live FFD price provider so `resolutions` shows real forward-alpha outcomes.
- [ ] 4.2 `pboFromBacktests(results[])` helper to build the CSCV matrix from repeated `runQuantBacktest` runs.
- [ ] 4.3 Overconfidence-gap feedback into prior calibration; per-theme durability decay half-life.
