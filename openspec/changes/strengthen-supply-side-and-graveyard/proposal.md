## Why

Two further structural gaps surfaced by the methodology scan, both confirmed against code:

1. **Demand-pull-only scoring.** `scoreCandidate` rewards era-trend / bottleneck-depth / supply-demand hits — all demand-side — while supply appears only as unused per-theme `negativeSignals` keywords. A chokepoint is investable only while supply stays scarce; the scorer had no first-class factor for capex intensity, capacity pipeline, or competitor entry, so it could be blindsided by the "供给快速释放" failure `METHODOLOGY_NOTE` names.
2. **Survivorship-biased track record.** `watchlist.ts` only ingests candidates that appear in a screen run; there was no store of passed-over / killed / downgraded theses, and no ex-ante, dated, machine-checkable falsifiers. Hit-rate could only be computed over survivors, and negative evidence was reactive keyword matching rather than pre-registered exit triggers.

## What Changes

- **P0-3 supply-side factor:** add `assessSupplyRelease` and a `capital-cycle-supply` negative score component that lowers the posterior (not the prior) on unambiguous oversupply / capacity-overshoot / competitive-entry signals, kept distinct from positive supply/demand terms and per-theme negativeSignals. Expose `trace.supplyReleaseSignals`.
- **P0-2 kill-criteria:** generate 3-5 dated, machine-checkable ex-ante falsifiers per candidate (`buildKillCriteria`), attach to `trace.killCriteria`, and persist them on watchlist entries pinned to first entry so due dates do not reset each run. `evaluateKillCriteria` fires only internally-confirmable overdue triggers.
- **P0-2 graveyard:** a `data/graveyard.json` store of below-bar / killed / downgraded theses with outcome backfill from resolutions and a `combinedBaseRate` that exposes survivorship inflation (survivors-only vs combined hit rate). Wired into the screen pipeline.

## Non-goals

- No live FFD capex/capacity wiring (the supply factor reads research text; live `ffd_industry_indicator_data`/`ffd_announcements` sourcing is a follow-up). No below-bar burial in the pipeline yet (needs the pre-slice matched list; the primitive is implemented and tested). No trade signals or position sizing.

## Capabilities

### New Capabilities
- `capital-cycle-supply-factor`: supply-side capacity-release penalty on candidate posterior.
- `kill-criteria-and-graveyard`: ex-ante falsifiers plus a survivorship-mitigating graveyard with outcome-conditioned base rates.

### Modified Capabilities
- `watchlist-lifecycle`: entries persist pinned kill criteria.

## Impact

- Affected code: `src/methodology.ts`, `src/types.ts`, `src/research/watchlist.ts`, `src/cli.ts`, new `src/research/kill-criteria.ts`, new `src/research/graveyard.ts`, tests.
- New artifact: `data/graveyard.json`. No new runtime dependency.
- Verified: typecheck + 89 unit tests + deterministic harness green.
