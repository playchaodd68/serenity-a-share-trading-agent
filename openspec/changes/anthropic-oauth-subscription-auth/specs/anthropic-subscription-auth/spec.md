## ADDED Requirements

### Requirement: Claude Subscription OAuth Login
The system SHALL let a user authenticate with a Claude Pro/Max subscription via OAuth and persist the credentials locally without committing them.

#### Scenario: Login persists credentials securely
- **WHEN** the user runs the Anthropic login command and completes the OAuth flow
- **THEN** the system stores the returned credentials in a local, gitignored file with owner-only permissions

#### Scenario: Status reports login state
- **WHEN** the user checks Anthropic auth status
- **THEN** the system reports whether credentials exist and the access-token expiry

### Requirement: Auto-Refreshed Token Resolution
The system SHALL resolve the Anthropic access token per request, refreshing it from the stored refresh token when expired.

#### Scenario: Valid token is reused
- **WHEN** the stored access token is not within the refresh window
- **THEN** the system uses it without contacting the token endpoint

#### Scenario: Expired token is refreshed and persisted
- **WHEN** the stored access token is expired
- **THEN** the system refreshes it with the refresh token and persists the new credentials for subsequent requests

### Requirement: Provider Auth Isolation
The system SHALL only apply Anthropic OAuth to the Anthropic provider and MUST preserve existing environment-key auth for other providers.

#### Scenario: Non-Anthropic provider falls back to env auth
- **WHEN** the configured provider is not Anthropic
- **THEN** the OAuth resolver returns no token and the provider uses its environment API key

#### Scenario: Not logged in falls back to env auth
- **WHEN** the provider is Anthropic but no OAuth credentials are stored
- **THEN** the resolver returns no token so `ANTHROPIC_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` can be used
