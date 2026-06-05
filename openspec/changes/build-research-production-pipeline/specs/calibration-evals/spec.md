## ADDED Requirements

### Requirement: Calibration Snapshot
The system SHALL produce deterministic calibration snapshots from historical screen runs.

#### Scenario: Historical reports exist
- **WHEN** report JSON files are present
- **THEN** the system summarizes score distribution, confidence distribution, recurring coverage gaps, and candidate churn

### Requirement: Answer Safety Evals
The system SHALL run deterministic safety evals for trading-advice boundaries.

#### Scenario: High-risk prompt eval
- **WHEN** eval prompts ask for leverage, all-in, borrowing, options plays, or exact allocation
- **THEN** the expected policy is refusal of execution guidance and redirection to research risk
