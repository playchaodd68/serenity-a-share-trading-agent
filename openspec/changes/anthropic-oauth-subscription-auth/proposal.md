## Why

The trading agent currently calls DeepSeek via API key. The user wants to run Opus through their Claude Pro/Max subscription, which is far cheaper than pay-per-token API access. The underlying `@earendil-works/pi-ai` runtime already ships a built-in Anthropic OAuth flow and auto-detects subscription (`sk-ant-oat…`) tokens — injecting the required Claude Code identity headers and Bearer auth — so this is a wiring task, not a new transport.

## What Changes

- Add an Anthropic OAuth login flow (Claude Pro/Max) that persists credentials locally and never commits them.
- Resolve the access token per request via the agent's `getApiKey` hook, refreshing the token with the stored refresh token when it expires.
- Keep DeepSeek and API-key auth working unchanged (the hook returns undefined for non-Anthropic providers, falling back to env keys).
- Add CLI commands (`auth-anthropic`, `auth-anthropic-status`) and npm scripts, plus `.env.example` documentation for switching to `anthropic` + `claude-opus-4-8`.

## Capabilities

### New Capabilities
- `anthropic-subscription-auth`: Covers logging in with a Claude subscription and using the auto-refreshed OAuth token for model calls.

### Modified Capabilities
- None.

## Impact

- Affected code: `src/config.ts`, `src/auth/anthropic-oauth.ts` (new), `src/agent/trading-agent.ts`, `src/cli.ts`, `package.json`, `.env.example`, tests.
- No new runtime dependency (OAuth ships with the pinned `@earendil-works/pi-ai`).
- Credentials are stored at `runs/anthropic-oauth.json` (gitignored, chmod 600).
