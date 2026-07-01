## ADDED Requirements

### Requirement: Active Negative-Signal Penalty
The system SHALL apply each matched theme's configured `negativeSignals` as an active penalty that lowers a candidate's posterior score, exposed as a traceable score component.

#### Scenario: Bear signal appears in candidate research text
- **WHEN** a candidate's matched-theme research text contains one or more of the theme's `negativeSignals`
- **THEN** the system adds a `negative-signal-penalty` component with a negative score
- **AND** the candidate's posterior score is lower than the same candidate without the bear signal
- **AND** the fired signals are listed in the candidate risks and as a negative-polarity evidence item.

#### Scenario: No negative signals match
- **WHEN** no configured negative signals appear in the candidate research text
- **THEN** the `negative-signal-penalty` component is present with score 0
- **AND** the prior score and the high-confidence eligibility path are unchanged.

### Requirement: Negatives Lower Posterior Not Prior
The system SHALL keep negative-signal penalties out of prior formation.

#### Scenario: Prior isolation
- **WHEN** a negative-signal penalty is applied
- **THEN** `priorScore` (industry-logic total) is unchanged
- **AND** only `posteriorScore` and the expected-value score decrease.
