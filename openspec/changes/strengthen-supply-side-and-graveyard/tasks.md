## 1. Capital-cycle supply-side factor (P0-3)

- [x] 1.1 Add `SUPPLY_RELEASE_TERMS` distinct from positive supply/demand terms and per-theme negativeSignals.
- [x] 1.2 Add `assessSupplyRelease` and a `capital-cycle-supply` negative component lowering posterior (penalty = clamp(hits*3, 0, 15)).
- [x] 1.3 Expose `trace.supplyReleaseSignals` and add a risk line; keep the high-confidence path at penalty 0.

## 2. Kill-criteria (P0-2)

- [x] 2.1 `buildKillCriteria` — 3-5 dated falsifiers with negative deltas and source checks, sliced to 5.
- [x] 2.2 `evaluateKillCriteria` — fire only internally-confirmable overdue triggers; route external ones to `overdue`.
- [x] 2.3 Attach `trace.killCriteria` in `scoreCandidate`; persist pinned on watchlist entries (no due-date reset per run).

## 3. Graveyard (P0-2)

- [x] 3.1 `buryBelowBar` / `buryKilled` / `buryDowngraded` / `mergeGraveyard` (upsert, earliest burial, outcome-preserving).
- [x] 3.2 `attachGraveyardOutcomes` from resolutions; `summarizeGraveyard`; `combinedBaseRate` exposing survivorship inflation.
- [x] 3.3 `data/graveyard.json` load/save; wire `updateGraveyard` into the screen pipeline + jsonl log + screen output.
- [x] 3.4 Wire `buryBelowBar`: `ScreenOptions.onMatched` surfaces the pre-slice matched list; passed-over candidates below the topN cut are buried.

## 4. Code-review fixes (post-review)

- [x] 4.1 mergeGraveyard preserves `matchedThemes` when a downgrade burial has none (no clobbering).
- [x] 4.2 Dedup the candidate-P0 predicate into `evidenceHasCandidateP0` (evidence.ts), reused by watchlist.ts + cli.ts.
- [x] 4.3 KillCriterion carries a discrete `signal` field; negative-signal firing matches on it, not on rendered prose.
- [x] 4.4 `expectationGapScore` wired: softens the expectation-window delta when the gap is already strong.

## 5. Verification

- [x] 5.1 TDD tests: tests/kill-criteria.test.ts, tests/graveyard.test.ts (incl. theme-preservation), methodology supply + kill-criteria tests.
- [x] 5.2 Typecheck + 90 unit tests + deterministic harness green; typescript-reviewer pass (no CRITICAL/HIGH).

## 6. Follow-ups (not in this change)

- [ ] 6.1 Live FFD supply sourcing: capex/在建工程 via `ffd_industry_indicator_data`, 定增/扩产 via `ffd_announcements`.
- [ ] 6.2 Per-theme constraint-durability sub-factor setting the bottleneck-depth decay half-life.
- [ ] 6.3 `/graveyard` CLI + Feishu command surfacing combinedBaseRate (survivorship inflation).
