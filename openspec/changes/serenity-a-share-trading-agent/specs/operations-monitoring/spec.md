## ADDED Requirements

### Requirement: Recurring Run Support
The system SHALL provide a CLI command suitable for cron or GitHub Actions.

#### Scenario: Scheduled screen
- **WHEN** `npm run screen` runs non-interactively
- **THEN** it writes logs and reports without prompting for user input.

### Requirement: Run Logs
The system SHALL write JSONL logs for ingestion, screening, Feishu, and harness runs.

#### Scenario: Run error
- **WHEN** a connector fails
- **THEN** the error is logged with source, timestamp, and recoverability metadata.

### Requirement: GitHub-ready Maintenance
The repository SHALL include README, environment example, source registry documentation, and tests so it can be pushed to a new GitHub repo.

#### Scenario: Fresh clone
- **WHEN** a maintainer clones the repository and runs documented setup
- **THEN** they can initialize the knowledgebase, run tests, and run a dry screening workflow.
