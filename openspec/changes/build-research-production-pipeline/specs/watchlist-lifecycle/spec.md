## ADDED Requirements

### Requirement: Persistent Watchlist
The system SHALL maintain a persistent watchlist of research candidates across screen runs.

#### Scenario: Candidate enters watchlist
- **WHEN** a screen run produces a candidate
- **THEN** the watchlist records the candidate, score, confidence, evidence state, coverage gaps, and next review date

#### Scenario: Candidate state updates
- **WHEN** a later run changes score, confidence, P0 evidence, or coverage gaps
- **THEN** the watchlist updates status and appends an audit event

### Requirement: Lifecycle Status
The system SHALL classify candidates into actionable research lifecycle states.

#### Scenario: Candidate lacks P0
- **WHEN** a candidate has no candidate-level P0 evidence
- **THEN** the status is evidence-needed or investigating, not confirmed
