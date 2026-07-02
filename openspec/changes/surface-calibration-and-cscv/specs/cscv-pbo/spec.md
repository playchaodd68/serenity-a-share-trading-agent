## ADDED Requirements

### Requirement: Probability of Backtest Overfitting
The system SHALL estimate the probability of backtest overfitting from a config-search matrix via Combinatorially-Symmetric Cross-Validation.

#### Scenario: Dominant configuration
- **WHEN** one configuration outperforms every other in every period
- **THEN** the probability of backtest overfitting is 0.

#### Scenario: In-sample winner flips out-of-sample
- **WHEN** the in-sample-best configuration tends to underperform out-of-sample
- **THEN** the probability of backtest overfitting is greater than 0.

#### Scenario: Invalid inputs
- **WHEN** the matrix has fewer than two configurations, is ragged, or the block count is odd or exceeds the period count
- **THEN** the computation raises an error.
