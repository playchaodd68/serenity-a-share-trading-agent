## ADDED Requirements

### Requirement: Realized-Outcome Resolution
The system SHALL grade a past candidate posterior against realized forward alpha versus the candidate's benchmark, using an injected price-return provider.

#### Scenario: Candidate beats its benchmark
- **WHEN** the provider returns a stock return above the benchmark return beyond the alpha deadband
- **THEN** the resolution outcome is 1, the label is `validated`, and the Brier score equals (posterior/100 - 1)^2.

#### Scenario: Candidate underperforms its benchmark
- **WHEN** realized alpha is at or below the negative deadband
- **THEN** the resolution outcome is 0 and the label is `falsified`.

#### Scenario: Alpha inside the deadband
- **WHEN** realized alpha is within the deadband around zero
- **THEN** the label is `inconclusive` while the binary outcome still records the sign for scoring.

#### Scenario: No market data
- **WHEN** the price-return provider returns no observation
- **THEN** the candidate is not resolved (null) and does not enter the calibration set.

### Requirement: Proper-Scoring Calibration Report
The system SHALL summarize resolutions with proper scoring rules and calibration diagnostics.

#### Scenario: Overconfidence detection
- **WHEN** high-posterior calls resolve less often than their stated confidence
- **THEN** the report exposes a positive overconfidence gap (mean confidence minus empirical hit rate)
- **AND** reports Brier mean, log-score mean, ECE, reliability bins, and breakdowns by confidence tier and evidence tier.

#### Scenario: No resolutions yet
- **WHEN** there are no resolved candidates
- **THEN** the report is empty-safe (resolved 0, Brier mean 0, empty reliability bins) without throwing.
