## ADDED Requirements

### Requirement: Feishu Webhook Notification
The system SHALL send screening summaries to Feishu when `FEISHU_WEBHOOK_URL` is configured.

#### Scenario: Webhook configured
- **WHEN** a screening run completes
- **THEN** the system posts a markdown summary with report path and top candidates.

### Requirement: Feishu Callback Verification
The system SHALL verify Feishu callback tokens before processing commands.

#### Scenario: Invalid token
- **WHEN** an inbound callback has an unexpected token
- **THEN** the system rejects it with HTTP 401
- **AND** does not run commands.

### Requirement: Interactive Commands
The system SHALL support `/screen`, `/why <code>`, `/sources`, and `/harness` commands.

#### Scenario: Screen command
- **WHEN** Feishu sends `/screen`
- **THEN** the system runs the screener
- **AND** replies with the latest report summary.
