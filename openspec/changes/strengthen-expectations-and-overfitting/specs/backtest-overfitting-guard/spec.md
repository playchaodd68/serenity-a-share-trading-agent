## ADDED Requirements

### Requirement: Multiple-Testing-Corrected Sharpe Gate
The system SHALL compute a Deflated Sharpe ratio that raises the null benchmark as the number of searched configurations increases.

#### Scenario: Trial-count deflation
- **WHEN** the same observed Sharpe is evaluated with more trials
- **THEN** the expected-maximum-Sharpe null benchmark rises and the Deflated Sharpe confidence falls.

#### Scenario: Weak edge under many trials
- **WHEN** a weak return stream is evaluated against a large trial count
- **THEN** the guard fails the pass threshold.

### Requirement: Purged Cross-Validation
The system SHALL provide purged, embargoed K-fold indices that partition the sample into contiguous test blocks with an embargoed training set.

#### Scenario: Partition and embargo
- **WHEN** purged K-fold indices are generated
- **THEN** the test blocks partition the full sample with no gaps or overlaps
- **AND** the training set for each fold excludes the test block and the embargo neighborhood around it.

### Requirement: Opt-In Backtest Guard
The system SHALL attach the overfitting guard to a backtest result only when a trial count is supplied, leaving existing behavior unchanged otherwise.

#### Scenario: Guard disabled by default
- **WHEN** no trial count is supplied
- **THEN** the backtest result has no overfitting guard and the report notes it is not run.
