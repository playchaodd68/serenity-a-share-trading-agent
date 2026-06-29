## 1. OAuth Auth Module

- [x] 1.1 Add `src/auth/anthropic-oauth.ts` with load/save (chmod 600), expiry check, auto-refresh token resolver, and interactive login.
- [x] 1.2 Add `anthropicOAuthCredentialsPath` to config (env override).

## 2. Agent And CLI Wiring

- [x] 2.1 Pass a `getApiKey` hook to the agent that returns a fresh OAuth token for Anthropic and falls back to env auth otherwise.
- [x] 2.2 Add `auth-anthropic` and `auth-anthropic-status` CLI commands + npm scripts.
- [x] 2.3 Document the Anthropic subscription path in `.env.example`.

## 3. Verification

- [x] 3.1 Unit-test expiry, round-trip, file permissions, and the refresh-and-persist path with injected deps.
- [x] 3.2 Run typecheck, unit tests, harness; smoke-test agent construction for deepseek and anthropic/opus.
