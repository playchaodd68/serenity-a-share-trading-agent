## ADDED Requirements

### Requirement: Supply-Side Capacity-Release Penalty
The system SHALL lower a candidate's posterior when its research text contains unambiguous capacity-overshoot or competitive-entry signals, exposed as a traceable `capital-cycle-supply` component.

#### Scenario: Oversupply signals appear
- **WHEN** a candidate's matched-theme research text contains supply-release terms (产能过剩/供给过剩/大幅扩产/新进入者/低价竞争 …)
- **THEN** the system adds a `capital-cycle-supply` component with a negative score
- **AND** the candidate's posterior is lower than the same candidate without those signals
- **AND** the fired terms are exposed in `trace.supplyReleaseSignals` and the candidate risks.

#### Scenario: No capacity-release signals
- **WHEN** no supply-release terms appear
- **THEN** the `capital-cycle-supply` component is present with score 0
- **AND** the prior score and the high-confidence eligibility path are unchanged.

### Requirement: No Double Counting With Demand Terms
The system SHALL keep supply-release terms distinct from the positive supply/demand terms and per-theme negativeSignals so a single phrase is not both rewarded and penalized by this factor.
