## ADDED Requirements

### Requirement: Ex-Ante Kill Criteria
The system SHALL attach dated, machine-checkable falsifiers to each candidate and persist them pinned to first entry.

#### Scenario: Kill criteria generated at entry
- **WHEN** a candidate is scored
- **THEN** 3-5 kill criteria are attached, each with a due date after entry, a negative posterior delta, and a source check
- **AND** an evidence-gap criterion is present only when the candidate lacks a P0
- **AND** a valuation criterion is present only for expensive names.

#### Scenario: Due dates do not reset across runs
- **WHEN** a candidate re-appears in a later screen run
- **THEN** its watchlist entry keeps the kill criteria pinned to first entry
- **AND** their due dates are not regenerated from the new run time.

### Requirement: Kill Trigger Evaluation
The system SHALL fire only internally-confirmable overdue triggers and route externally-confirmable ones to review.

#### Scenario: Evidence-gap trigger fires when overdue and P0 still missing
- **WHEN** the evidence-gap due date has passed and the candidate still has no candidate-level P0
- **THEN** the trigger fires with its negative delta.

#### Scenario: Trigger resolved before due date
- **WHEN** a candidate P0 arrived before the evidence-gap due date
- **THEN** the trigger neither fires nor remains pending.

### Requirement: Survivorship-Mitigating Graveyard
The system SHALL persist passed-over, killed, and downgraded theses and compute hit rates over survivors plus losers.

#### Scenario: Burial and outcome backfill
- **WHEN** a candidate is passed over below the entry bar, killed by a fired criterion, or downgraded out of the active set
- **THEN** it is recorded in the graveyard, deduped by code keeping the earliest burial and newest reason
- **AND** realized outcomes are backfilled from resolutions by code.

#### Scenario: Survivorship inflation is measurable
- **WHEN** combined base rates are computed
- **THEN** the survivors-only hit rate and the combined (survivors + buried) hit rate are both reported so survivorship inflation is visible.
