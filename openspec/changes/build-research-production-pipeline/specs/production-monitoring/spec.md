## ADDED Requirements

### Requirement: Production Readiness Doctor
The system SHALL diagnose production-readiness gaps for scheduled monitoring and Feishu operation.

#### Scenario: Feishu webhook missing
- **WHEN** Feishu webhook notification is not configured
- **THEN** doctor reports it as a production readiness gap

#### Scenario: Stale research run
- **WHEN** no recent screen run or watchlist update exists
- **THEN** doctor reports stale research state

### Requirement: Scheduled Research Run
The system SHALL provide a CLI entrypoint that refreshes sources, screens candidates, updates watchlist state, and writes operational logs.

#### Scenario: Research refresh completes
- **WHEN** the refresh command runs
- **THEN** it writes report, watchlist, evidence, graph, and doctor artifacts
