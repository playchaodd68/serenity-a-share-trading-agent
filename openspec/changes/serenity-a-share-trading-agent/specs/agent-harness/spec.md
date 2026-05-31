## ADDED Requirements

### Requirement: Pi Agent Construction
The system SHALL expose a Pi `Agent` factory with the Serenity system prompt and domain tools.

#### Scenario: Agent factory invoked
- **WHEN** the application creates the trading agent
- **THEN** the returned object includes Pi agent metadata and registered tool names.

### Requirement: Deterministic Harness
The system SHALL run deterministic scenarios without requiring LLM credentials.

#### Scenario: Harness run
- **WHEN** the user runs `npm run harness`
- **THEN** the harness validates methodology traces, candidate scoring, Feishu command routing, and Obsidian initialization planning.

### Requirement: Code Review Gate
The system SHALL include automated checks that must pass before publishing.

#### Scenario: Review command
- **WHEN** the user runs `npm run review`
- **THEN** TypeScript type checking, unit tests, and harness checks run successfully.
